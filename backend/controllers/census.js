const { isAuthorised } = require("../modules/tierCensus/auth");
const { collect } = require("../modules/tierCensus/collector");
const { createRunner } = require("../modules/tierCensus/runner");
const {
  recordObservations, readWindow, readCoverage, isWindowCollected, readLatestSeason,
  readRankPoints,
} = require("../modules/tierCensus/pgStore");
const { getCurrentSeasonId, getSeasonCatalog } = require("../modules/getSeasonCatalog");
const { seasonForWindow, previousSeasonId, seasonStartDate } = require("../modules/tierCensus/seasonWindow");
const { estimateIcc, PER_MATCH } = require("../modules/tierCensus/sampling");
const { tierShare, rpThresholds } = require("../modules/tierCensus/stats");
const { isDbFailing } = require("../modules/db/health");

const SHARD = "steam";

// A run walks ~1100 free match reads and then one metered call per drawn
// player. Well under the six hours a GitHub Actions job gets, and the pacer
// aborts rather than overrun it.
const RUN_DEADLINE_MS = 80 * 60_000;

// Pooling days is how the interval narrows; a week is the first window that
// carries a useful one.
const DEFAULT_DAYS = 7;

// Ranked resets roughly every three months, and for the first days after one
// the current season's rows say only that almost nobody has placed yet. That is
// a true measurement of a transient state and a misleading answer to "where do
// players sit", so the finished season stands until the new one has three days
// behind it -- by which point placement has largely settled and the pooled
// interval means something.
const MIN_WINDOWS = 3;

// The collector runs once a day, and until 2026-09-10 this endpoint read the raw
// observations back on EVERY request: two queries returning one row per sampled
// account, ~1 MB of Neon transfer a time. It is called from the player page, so
// crawlers alone were enough to spend the project's whole monthly allowance in
// ten days, which took recent searches and RP history down with it.
//
// A published daily statistic does not need to be recomputed per visitor.
//
// Six hours rather than something cautious like thirty minutes, because this TTL
// is only a backstop: a finished collection clears the cache outright (see
// runCensus), so the figure is never stale for having been cached -- it is stale
// only if the collector did not run, in which case a shorter TTL would just
// re-read the same rows. The difference is 4 cold reads a day against 48.
const DISTRIBUTION_CACHE_MS = 6 * 60 * 60 * 1000;

// Kept shorter than the in-process TTL on purpose. A visitor re-asking hourly is
// answered from memory at no cost to Postgres, while a CDN or browser holding
// the answer for six hours could outlive a collection that has already replaced
// it -- and nothing downstream can be told to drop it early.
const DISTRIBUTION_HTTP_MAX_AGE_S = 60 * 60;

// A read that failed is cached too -- briefly. Long enough that a database in
// trouble is not asked again by every visitor, short enough that the page
// recovers on its own within a minute of the database doing so.
const DISTRIBUTION_ERROR_CACHE_MS = 60 * 1000;

// Last resort only. Reached when PUBG's catalog cannot be asked and no override
// is set: wrong for at most one run, and the next run is what corrects it.
// Kept in step with json/season-dates.json, which a rollover updates anyway --
// censusController.test.js fails when the two drift.
const FALLBACK_SEASON = "division.bro.official.pc-2018-43";

// What a poll is allowed to see. The raw observations are a couple of thousand
// rows and belong in Postgres, not in a status response.
const summarise = (result) => ({
  windowDate: result.windowDate,
  matchesSeen: result.matchesSeen,
  rankedMatches: result.rankedMatches,
  matchesFailed: result.matchesFailed,
  playersFailed: result.playersFailed,
  observed: result.observations?.length ?? 0,
  stored: result.stored,
  meteredCalls: result.calls,
  rateLimited: result.rateLimited,
  aborted: result.aborted,
  skipped: Boolean(result.skipped),
  skipReason: result.skipReason,
});

const createCensusController = ({
  collect: doCollect = collect,
  store = recordObservations,
  readWindow: doReadWindow = readWindow,
  readCoverage: doReadCoverage = readCoverage,
  readLatestSeason: doReadLatestSeason = readLatestSeason,
  readRankPoints: doReadRankPoints = readRankPoints,
  windowCollected = isWindowCollected,
  currentSeason = () => getCurrentSeasonId(SHARD),
  // The same catalog the line above reads, and the same cached fetch: the
  // rollover rule needs the season below the current one to attribute a sample
  // day played before the reset.
  previousSeason = async () => previousSeasonId(await getSeasonCatalog(SHARD)),
  startDateOf = seasonStartDate,
  token = () => process.env.CENSUS_TOKEN,
} = {}) => {
  const runner = createRunner({ collect: doCollect });

  // The override first, so a catalog that is ever wrong about which season is
  // current can be corrected without a deploy.
  const seasonId = async () => {
    const override = process.env.PUBG_CENSUS_SEASON;
    if (override) return override;
    try {
      const resolved = await currentSeason();
      if (resolved) return resolved;
    } catch (error) {
      console.log(`[census] could not resolve the current season: ${error.message}`);
    }
    return FALLBACK_SEASON;
  };
  // Which season a given sample day should be measured against, decided once
  // per run. The collector cannot decide it: PUBG names the window, and it
  // only does that once the run's first call has already been spent.
  const windowSeason = async (season) => {
    // A pinned season means "collect for exactly this one", which is also how
    // a day the rule below declines to attribute gets backfilled by hand.
    if (process.env.PUBG_CENSUS_SEASON) return () => season;

    let previous = null;
    try {
      previous = await previousSeason();
    } catch (error) {
      console.log(`[census] could not resolve the previous season: ${error.message}`);
    }

    const startDate = startDateOf(season);
    return (windowDate) =>
      seasonForWindow({ windowDate, currentSeasonId: season, previousSeasonId: previous, startDate });
  };

  let inFlight = Promise.resolve();

  // 404 rather than 401, on both guarded routes: an unauthorised caller learns
  // nothing about whether they exist.
  const notFound = (res) => res.status(404).json({ status: 404, message: "Not found" });

  // POST /api/census/run -- the scheduled job's entry point.
  //
  // Starts the run and answers straight away. It used to hold the response open
  // for the whole collection, which Render's proxy cut at thirty minutes: the
  // job saw a 502, and because the rows were written in one closing batch, an
  // hour of PUBG quota went into the bin. The job now polls getStatus, which
  // doubles as the inbound traffic that stops a free instance from spinning
  // down under its own background work.
  const runCensus = async (req, res) => {
    if (!isAuthorised(req.headers, token())) return notFound(res);

    const season = await seasonId();
    const started = runner.start({
      shard: SHARD,
      seasonId: season,
      seasonFor: await windowSeason(season),
      apiKey: process.env.PUBG_API_KEY,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      deadlineMs: RUN_DEADLINE_MS,
      onObservations: store,
      // The season the collector settled on, not the one the run opened with:
      // asking about a day under a season nothing will be written to answers
      // about the wrong rows.
      windowCollected: (windowDate, forSeason) =>
        windowCollected({ shard: SHARD, seasonId: forSeason || season, windowDate }),
    });

    // A finished run is new data, so the published result stops being current
    // the moment it lands -- clear rather than wait out the TTL.
    if (started.done) inFlight = started.done.finally(() => distributionCache.clear());

    return res.status(200).json({
      status: 200,
      data: { started: started.started, runId: started.runId, reason: started.reason },
    });
  };

  // GET /api/census/status -- how the job learns the outcome.
  const getStatus = async (req, res) => {
    if (!isAuthorised(req.headers, token())) return notFound(res);

    const status = runner.status();
    return res.status(200).json({
      status: 200,
      data: {
        state: status.state,
        runId: status.runId,
        startedAt: status.startedAt,
        finishedAt: status.finishedAt,
        progress: status.progress,
        message: status.message,
        result: status.result ? summarise(status.result) : undefined,
      },
    });
  };

  // The published result for one window width, built from the raw observations.
  // Every caller goes through the cache in getDistribution -- this is the only
  // thing in the module that touches Postgres per request.
  const buildDistribution = async (days) => {
    const currentSeasonId = await seasonId();

    let season = currentSeasonId;
    let coverage = await doReadCoverage({ shard: SHARD, seasonId: season, days });

    // Too new to say anything: stand on the last season that can.
    if (coverage.windows < MIN_WINDOWS) {
      const latest = await doReadLatestSeason({
        shard: SHARD,
        exclude: season,
        minWindows: MIN_WINDOWS,
      });
      if (latest && latest !== season) {
        season = latest;
        coverage = await doReadCoverage({ shard: SHARD, seasonId: season, days });
      }
    }

    const rows = await doReadWindow({ shard: SHARD, seasonId: season, days });

    // An extra, not the point of this endpoint: the tier bars must still ship
    // if the rank points cannot be read.
    let rpPercentiles = null;
    try {
      rpPercentiles = rpThresholds(await doReadRankPoints({ shard: SHARD, seasonId: season, days }));
    } catch (error) {
      console.log(`[census] could not build the RP table: ${error.message}`);
    }

    // Tiers come from what was measured, including the untiered bucket -- a
    // player who has not queued ranked this season is a real part of the
    // denominator, not a gap to be quietly dropped.
    const buckets = new Map();
    for (const row of rows) {
      const key = row.tier ?? "unranked";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const tiers = [...buckets.entries()]
      .map(([tier, count]) => {
        const icc = estimateIcc(rows, tier === "unranked" ? null : tier);
        return { tier, count, ...tierShare({ successes: count, n: rows.length, clusterSize: PER_MATCH, icc }) };
      })
      .sort((a, b) => b.count - a.count);

    return {
      status: 200,
      data: {
        seasonId: season,
        // Whether this is the season being played right now. False means the
        // page is showing a finished season while the new one fills up, and
        // it has to say so rather than pass it off as current.
        current: season === currentSeasonId,
        shard: SHARD,
        days,
        // Everything the page needs to show its working rather than just a
        // percentage: how many accounts, how many lobbies, and over what dates.
        accounts: rows.length,
        matches: coverage.matches,
        windows: coverage.windows,
        firstDate: coverage.firstDate,
        lastDate: coverage.lastDate,
        perMatch: PER_MATCH,
        // The RP standing at each whole percentile, index 0 the top of the
        // ladder. Lets a player page place a visitor without a query of its
        // own. Null when the sample is too thin to cut.
        rpPercentiles,
        tiers,
      },
    };
  };

  const distributionCache = new Map();
  const inFlightDistribution = new Map();

  function startDistribution(days) {
    // Deferred to a microtask for the same reason as the in-flight maps in
    // parsePlayerRank: the entry has to be in place before anything that could
    // throw synchronously runs, or the finally below would delete it first and
    // leave a rejected promise wedged in the map.
    const run = Promise.resolve().then(async () => {
      try {
        const body = await buildDistribution(days);
        // A payload assembled while Postgres was failing is not the published
        // result, it is the absence of one. Holding it for half an hour would
        // keep serving zeroes for half an hour after the database came back,
        // and telling a CDN to store it would outlive even that.
        const failing = isDbFailing();
        const entry = {
          body,
          timestamp: Date.now(),
          maxAge: failing ? DISTRIBUTION_ERROR_CACHE_MS : DISTRIBUTION_CACHE_MS,
          header: failing
            ? "no-store"
            : `public, max-age=${DISTRIBUTION_HTTP_MAX_AGE_S}, stale-while-revalidate=3600`,
        };
        distributionCache.set(days, entry);
        return entry;
      } finally {
        inFlightDistribution.delete(days);
      }
    });

    inFlightDistribution.set(days, run);
    return run;
  }

  const getDistribution = async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query?.days) || DEFAULT_DAYS));

    const cached = distributionCache.get(days);
    if (cached && Date.now() - cached.timestamp < cached.maxAge) {
      res.set("Cache-Control", cached.header);
      return res.status(200).json(cached.body);
    }

    try {
      const entry = await (inFlightDistribution.get(days) || startDistribution(days));
      res.set("Cache-Control", entry.header);
      return res.status(200).json(entry.body);
    } catch (e) {
      return res.status(200).json({ status: 200, message: e.message });
    }
  };

  // Test seam, as in pgStore's __reset: lets a spec await the background run
  // instead of racing it on a timer.
  const __idle = () => inFlight;

  return { runCensus, getStatus, getDistribution, __idle, __clearDistributionCache: () => distributionCache.clear() };
};

const defaultController = createCensusController();

module.exports = {
  createCensusController,
  runCensus: defaultController.runCensus,
  getStatus: defaultController.getStatus,
  getDistribution: defaultController.getDistribution,
};
