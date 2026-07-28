const {
  shardForMatch,
  fetchPubgJson,
  fetchTelemetryJson,
  findTelemetryUrl,
} = require("./pubgTelemetry");
const { setRateLimited, isRateLimited } = require("./playerRank/state");

const bundleCache = new Map();
const inFlight = new Map();
const BUNDLE_TTL_MS = 10 * 60 * 1000;
// Budgeted in telemetry JSON bytes; measured retained heap runs ~1.3x that, so this caps the cache near 125 MB of Render's 512 MB.
const BUNDLE_CACHE_BYTES = 96 * 1024 * 1024;
const BUNDLE_CACHE_ENTRIES = 24;

let now = () => Date.now();
let cachedBytes = 0;

function __clearMatchCache() {
  bundleCache.clear();
  inFlight.clear();
  cachedBytes = 0;
}

function __setMatchCacheClock(fn) {
  now = typeof fn === "function" ? fn : () => Date.now();
}

function __matchCacheStats() {
  return {
    bytes: cachedBytes,
    keys: [...bundleCache.keys()],
    budgetBytes: BUNDLE_CACHE_BYTES,
    ttlMs: BUNDLE_TTL_MS,
    maxEntries: BUNDLE_CACHE_ENTRIES,
  };
}

function evict(cacheKey) {
  const entry = bundleCache.get(cacheKey);
  if (!entry) return;
  bundleCache.delete(cacheKey);
  cachedBytes = Math.max(0, cachedBytes - entry.bytes);
}

function dropExpired(at) {
  for (const [cacheKey, entry] of bundleCache) {
    if (at - entry.storedAt >= BUNDLE_TTL_MS) evict(cacheKey);
  }
}

function readCached(cacheKey, at) {
  const entry = bundleCache.get(cacheKey);
  if (!entry) return null;
  if (at - entry.storedAt >= BUNDLE_TTL_MS) {
    evict(cacheKey);
    return null;
  }
  bundleCache.delete(cacheKey);
  bundleCache.set(cacheKey, entry);
  return entry.bundle;
}

function store(cacheKey, bundle, rawBytes, at) {
  dropExpired(at);
  const bytes = Number.isFinite(rawBytes) && rawBytes > 0 ? rawBytes : BUNDLE_CACHE_BYTES;
  if (bytes > BUNDLE_CACHE_BYTES) return;
  evict(cacheKey);
  bundleCache.set(cacheKey, { bundle, bytes, storedAt: at });
  cachedBytes += bytes;
  while (cachedBytes > BUNDLE_CACHE_BYTES || bundleCache.size > BUNDLE_CACHE_ENTRIES) {
    const leastRecent = bundleCache.keys().next().value;
    if (leastRecent === undefined || leastRecent === cacheKey) break;
    evict(leastRecent);
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
  const { telemetry, bytes } = await fetchTelemetryJson(telemetryUrl);
  return { bundle: { matchShard, matchAttributes, matchPayload, telemetry }, bytes };
}

async function loadMatchBundle({ shard, matchId }) {
  if (!matchId) throw new Error("matchId is required");
  const matchShard = shardForMatch(shard);
  const cacheKey = `${matchShard}:${matchId}`;
  const cached = readCached(cacheKey, now());
  if (cached) return cached;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
  if (isRateLimited()) throw new Error("Rate Limit Reached");

  const run = (async () => {
    try {
      const { bundle, bytes } = await build({ matchShard, matchId });
      store(cacheKey, bundle, bytes, now());
      return bundle;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, run);
  return run;
}

module.exports = {
  loadMatchBundle,
  __clearMatchCache,
  __setMatchCacheClock,
  __matchCacheStats,
};
