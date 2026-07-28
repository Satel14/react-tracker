const playerCache = new Map();
const playerNameCache = new Map();
const statsCache = new Map();
const lifetimeStatsCache = new Map();
const seasonCatalogCache = new Map();
const steamAvatarCache = new Map();
const playerProfileCache = new Map();
const clanCache = new Map();
const masteryCache = new Map();
const matchSummaryCache = new Map();
const inFlightRankRequests = new Map();
const stalePlayerDataCache = new Map();
const leaderboardCache = new Map();
const extrasCache = new Map();
const inFlightExtrasRequests = new Map();
const inFlightResolveRequests = new Map();
const inFlightSeasonCatalogRequests = new Map();

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

let rateLimitedUntil = 0;

function setRateLimited() {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
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
  playerProfileCache,
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
  leaderboardCache,
  LEADERBOARD_CACHE_DURATION,
  extrasCache,
  inFlightExtrasRequests,
  inFlightResolveRequests,
  inFlightSeasonCatalogRequests,
  EXTRAS_RETRY_COOLDOWN_MS,
};
