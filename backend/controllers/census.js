const { isAuthorised } = require("../modules/tierCensus/auth");
const { collect } = require("../modules/tierCensus/collector");
const { createRunner } = require("../modules/tierCensus/runner");
const {
  recordObservations, readWindow, readCoverage, isWindowCollected, readLatestSeason,
  readRankPoints,
} = require("../modules/tierCensus/pgStore");
const { getCurrentSeasonId } = require("../modules/getSeasonCatalog");
const { estimateIcc, PER_MATCH } = require("../modules/tierCensus/sampling");
const { tierShare, rpThresholds } = require("../modules/tierCensus/stats");

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

// Last resort only. Reached when PUBG's catalog cannot be asked and no override
// is set: wrong for at most one run, and the next run is what corrects it.
const FALLBACK_SEASON = "division.bro.official.pc-2018-42";

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
      apiKey: process.env.PUBG_API_KEY,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      deadlineMs: RUN_DEADLINE_MS,
      onObservations: store,
      windowCollected: (windowDate) => windowCollected({ shard: SHARD, seasonId: season, windowDate }),
    });

    if (started.done) inFlight = started.done;

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

  // GET /api/census/distribution -- what the page reads. Public: it is the
  // published result, and it costs no PUBG quota.
  const getDistribution = async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query?.days) || DEFAULT_DAYS));
      const currentSeasonId = await seasonId();

      let season = currentSeasonId;
      let coverage = await doReadCoverage({ shard: SHARD, seasonId: season, days });

      // Too new to say anything: stand on the last season that can.
      if (coverage.windows < MIN_WINDOWS) {
        const latest = await doReadLatestSeason({ shard: SHARD });
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

      return res.status(200).json({
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
      });
    } catch (e) {
      return res.status(200).json({ status: 200, message: e.message });
    }
  };

  // Test seam, as in pgStore's __reset: lets a spec await the background run
  // instead of racing it on a timer.
  const __idle = () => inFlight;

  return { runCensus, getStatus, getDistribution, __idle };
};

const defaultController = createCensusController();

module.exports = {
  createCensusController,
  runCensus: defaultController.runCensus,
  getStatus: defaultController.getStatus,
  getDistribution: defaultController.getDistribution,
};
