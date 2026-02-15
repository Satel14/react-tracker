const playerCache = new Map();
const playerNameCache = new Map();
const statsCache = new Map();
const lifetimeStatsCache = new Map();
const seasonCatalogCache = new Map();
const steamAvatarCache = new Map();
const inFlightRankRequests = new Map();
const stalePlayerDataCache = new Map();

const CACHE_DURATION = 10 * 60 * 1000;
const CURRENT_SEASON_CACHE_DURATION = 60 * 60 * 1000;
const STEAM_CACHE_DURATION = 6 * 60 * 60 * 1000;
const STALE_PLAYER_DATA_CACHE_DURATION = 30 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 20 * 1000;

let rateLimitedUntil = 0;

function setRateLimited() {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
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
  playerCache,
  playerNameCache,
  seasonCatalogCache,
  setRateLimited,
  statsCache,
  steamAvatarCache,
  inFlightRankRequests,
  isRateLimited,
  getStalePlayerData,
  setStalePlayerData,
};
