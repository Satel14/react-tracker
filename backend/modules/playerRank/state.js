const { BoundedMap } = require("../boundedMap");
const { recordRateLimit } = require("../runtimeStats");

// Whole mapped payloads: the most expensive entries here by an order of
// magnitude, and the ones worth the tightest ceiling.
const PAYLOAD_LIMIT = 500;
// Per-resource fragments -- a clan, a mastery block, eight match summaries.
const FRAGMENT_LIMIT = 2000;
// Strings and timestamps. Cheap enough that the ceiling is only a backstop.
const LOOKUP_LIMIT = 20000;

const playerCache = new BoundedMap(LOOKUP_LIMIT);
const playerNameCache = new BoundedMap(LOOKUP_LIMIT);
const statsCache = new BoundedMap(PAYLOAD_LIMIT);
const lifetimeStatsCache = new BoundedMap(FRAGMENT_LIMIT);
const seasonCatalogCache = new Map();
const steamAvatarCache = new BoundedMap(LOOKUP_LIMIT);
const playerProfileCache = new BoundedMap(FRAGMENT_LIMIT);
const clanCache = new BoundedMap(FRAGMENT_LIMIT);
const masteryCache = new BoundedMap(FRAGMENT_LIMIT);
const matchSummaryCache = new BoundedMap(FRAGMENT_LIMIT);
// matchId -> server region. A played match's region never changes, so this is
// not a TTL cache; enrichment caps its size instead.
const matchRegionCache = new Map();
const inFlightRankRequests = new Map();
const stalePlayerDataCache = new BoundedMap(PAYLOAD_LIMIT);
const leaderboardCache = new BoundedMap(FRAGMENT_LIMIT);
const extrasCache = new BoundedMap(PAYLOAD_LIMIT);
const inFlightExtrasRequests = new Map();
const inFlightResolveRequests = new Map();
const inFlightSeasonCatalogRequests = new Map();
// `shard:accountId:seasonId` -> when a rank-point reading was last taken, from
// either a fresh fetch or a cache-hit refresh.
const rankPointReadingCache = new BoundedMap(LOOKUP_LIMIT);

// 30 min matches PUBG's guidance: a match lasts 20-30 min and new data takes
// 5-15 min to reach the API, so a shorter TTL mostly refetches unchanged stats.
const CACHE_DURATION = 30 * 60 * 1000;
const CURRENT_SEASON_CACHE_DURATION = 60 * 60 * 1000;
const STEAM_CACHE_DURATION = 6 * 60 * 60 * 1000;
// Outlives CACHE_DURATION so a rate-limit cooldown still has a fallback after
// the fresh entry expires.
const STALE_PLAYER_DATA_CACHE_DURATION = 60 * 60 * 1000;
const LEADERBOARD_CACHE_DURATION = 2 * 60 * 60 * 1000;
// PUBG frees a renamed handle for anyone else to claim, so name mappings must expire.
const PLAYER_NAME_CACHE_DURATION = 6 * 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 20 * 1000;
const EXTRAS_RETRY_COOLDOWN_MS = 120 * 1000;
// How often a cache hit may spend one ranked request to record a reading. A
// ranked match runs 20-30 min, so a minute is far finer than the thing being
// measured and still caps a page held on refresh at 60 requests an hour of the
// 100-per-minute budget.
const RANK_POINT_READING_INTERVAL_MS = 60 * 1000;

let rateLimitedUntil = 0;

function setRateLimited() {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  recordRateLimit();
}

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}

// How full each cache is, next to what it is allowed to hold. Read off this
// module's own exports rather than a hand-kept list: a cache added below is
// reported the moment it is exported, and the list could not be forgotten into
// staleness the way a copy of it would be.
function getCacheSizes() {
  return Object.fromEntries(
    Object.entries(module.exports)
      .filter(([, value]) => value instanceof BoundedMap)
      .map(([name, cache]) => [name, { size: cache.size, limit: cache.limit }]),
  );
}

function getCachedAccountId(shard, requestedPlayerId) {
  const key = `${shard}:${requestedPlayerId}`;
  const entry = playerCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > PLAYER_NAME_CACHE_DURATION) {
    playerCache.delete(key);
    return null;
  }

  return entry.accountId;
}

function setCachedAccountId(shard, requestedPlayerId, accountId) {
  if (!requestedPlayerId || !accountId) return;
  playerCache.set(`${shard}:${requestedPlayerId}`, {
    accountId,
    timestamp: Date.now(),
  });
}

function getStalePlayerData(cacheKey) {
  const entry = stalePlayerDataCache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > STALE_PLAYER_DATA_CACHE_DURATION) {
    stalePlayerDataCache.delete(cacheKey);
    return null;
  }

  return entry.data;
}

function setStalePlayerData(cacheKey, data) {
  stalePlayerDataCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

module.exports = {
  CACHE_DURATION,
  CURRENT_SEASON_CACHE_DURATION,
  STEAM_CACHE_DURATION,
  lifetimeStatsCache,
  clanCache,
  masteryCache,
  matchSummaryCache,
  matchRegionCache,
  playerProfileCache,
  playerCache,
  playerNameCache,
  PLAYER_NAME_CACHE_DURATION,
  getCachedAccountId,
  setCachedAccountId,
  seasonCatalogCache,
  setRateLimited,
  statsCache,
  steamAvatarCache,
  inFlightRankRequests,
  isRateLimited,
  getStalePlayerData,
  setStalePlayerData,
  stalePlayerDataCache,
  leaderboardCache,
  LEADERBOARD_CACHE_DURATION,
  extrasCache,
  inFlightExtrasRequests,
  inFlightResolveRequests,
  inFlightSeasonCatalogRequests,
  EXTRAS_RETRY_COOLDOWN_MS,
  rankPointReadingCache,
  RANK_POINT_READING_INTERVAL_MS,
  getCacheSizes,
};
