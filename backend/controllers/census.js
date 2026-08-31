const { isAuthorised } = require("../modules/tierCensus/auth");
const { collect } = require("../modules/tierCensus/collector");
const { recordObservations, readWindow, readCoverage } = require("../modules/tierCensus/pgStore");
const { estimateIcc, PER_MATCH } = require("../modules/tierCensus/sampling");
const { tierShare } = require("../modules/tierCensus/stats");

const SHARD = "steam";

// A run walks ~1100 free match reads and then one metered call per drawn
// player. Well under the six hours a GitHub Actions job gets, and the pacer
// aborts rather than overrun it.
const RUN_DEADLINE_MS = 80 * 60_000;

// Pooling days is how the interval narrows; a week is the first window that
// carries a useful one.
const DEFAULT_DAYS = 7;

let running = false;

const currentSeasonId = () =>
  process.env.PUBG_CENSUS_SEASON || "division.bro.official.pc-2018-42";

// POST /api/census/run -- the scheduled job's only entry point.
module.exports.runCensus = async (req, res) => {
  if (!isAuthorised(req.headers, process.env.CENSUS_TOKEN)) {
    // 404 rather than 401: an unauthenticated caller learns nothing about
    // whether this route exists.
    return res.status(404).json({ status: 404, message: "Not found" });
  }

  // Render can wake more than one instance, and a missed schedule can fire late
  // on top of a run already going. Two concurrent runs would double the quota
  // spend for the same rows.
  if (running) {
    return res.status(200).json({ status: 200, data: { skipped: "already running" } });
  }

  running = true;
  try {
    const seasonId = currentSeasonId();
    const result = await collect({
      shard: SHARD,
      seasonId,
      apiKey: process.env.PUBG_API_KEY,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      deadlineMs: RUN_DEADLINE_MS,
    });

    const stored = await recordObservations(result.observations);

    return res.status(200).json({
      status: 200,
      data: {
        windowDate: result.windowDate,
        matchesSeen: result.matchesSeen,
        rankedMatches: result.rankedMatches,
        matchesFailed: result.matchesFailed,
        playersFailed: result.playersFailed,
        observed: result.observations.length,
        stored,
        meteredCalls: result.calls,
        rateLimited: result.rateLimited,
        aborted: result.aborted,
      },
    });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  } finally {
    running = false;
  }
};

// GET /api/census/distribution -- what the page reads. Public: it is the
// published result, and it costs no PUBG quota.
module.exports.getDistribution = async (req, res) => {
  try {
    const seasonId = currentSeasonId();
    const days = Math.min(90, Math.max(1, Number(req.query?.days) || DEFAULT_DAYS));

    const [rows, coverage] = await Promise.all([
      readWindow({ shard: SHARD, seasonId, days }),
      readCoverage({ shard: SHARD, seasonId, days }),
    ]);

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
        seasonId,
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
        tiers,
      },
    });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};
