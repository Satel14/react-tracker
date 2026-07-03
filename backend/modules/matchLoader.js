const {
  shardForMatch,
  fetchPubgJson,
  fetchTelemetryJson,
  findTelemetryUrl,
} = require("./pubgTelemetry");
const { setRateLimited, isRateLimited } = require("./playerRank/state");

const bundleCache = new Map();
const inFlight = new Map();
const BUNDLE_CACHE_LIMIT = 30;

function __clearMatchCache() {
  bundleCache.clear();
  inFlight.clear();
}

function trim() {
  while (bundleCache.size > BUNDLE_CACHE_LIMIT) {
    const oldest = bundleCache.keys().next().value;
    if (!oldest) break;
    bundleCache.delete(oldest);
  }
}

async function build({ matchShard, matchId }) {
  const matchUrl = `https://api.pubg.com/shards/${matchShard}/matches/${encodeURIComponent(matchId)}`;
  let matchPayload;
  try {
    matchPayload = await fetchPubgJson(matchUrl, true);
  } catch (e) {
    if (/rate limit/i.test(e.message)) setRateLimited();
    throw e;
  }
  const matchAttributes = matchPayload?.data?.attributes || {};
  const telemetryUrl = findTelemetryUrl(matchPayload);
  if (!telemetryUrl) throw new Error("Telemetry asset unavailable for this match");
  const telemetry = await fetchTelemetryJson(telemetryUrl);
  return { matchShard, matchAttributes, matchPayload, telemetry };
}

async function loadMatchBundle({ shard, matchId }) {
  if (!matchId) throw new Error("matchId is required");
  const matchShard = shardForMatch(shard);
  const cacheKey = `${matchShard}:${matchId}`;
  if (bundleCache.has(cacheKey)) return bundleCache.get(cacheKey);
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
  if (isRateLimited()) throw new Error("Rate Limit Reached");

  const run = (async () => {
    try {
      const bundle = await build({ matchShard, matchId });
      bundleCache.set(cacheKey, bundle);
      trim();
      return bundle;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, run);
  return run;
}

module.exports = { loadMatchBundle, __clearMatchCache };
