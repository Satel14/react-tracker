const { createPubgApiClient } = require("./playerRank/pubgApi");
const { createSeasonCatalogService } = require("./playerRank/seasonCatalog");
const { createLeaderboardService } = require("./leaderboard/leaderboardService");
const {
  seasonCatalogCache,
  CURRENT_SEASON_CACHE_DURATION,
  leaderboardCache,
  LEADERBOARD_CACHE_DURATION,
  setRateLimited,
  inFlightSeasonCatalogRequests,
} = require("./playerRank/state");

const PUBG_API_KEY = process.env.PUBG_API_KEY;

const { doRequest } = createPubgApiClient({
  apiKey: PUBG_API_KEY,
  onRateLimit: setRateLimited,
});

const { getSeasonCatalog } = createSeasonCatalogService({
  seasonCatalogCache,
  currentSeasonCacheDuration: CURRENT_SEASON_CACHE_DURATION,
  doRequest,
  inFlightSeasonCatalogRequests,
});

const { getLeaderboard, getSeasons } = createLeaderboardService({
  doRequest,
  getSeasonCatalog,
  leaderboardCache,
  cacheDuration: LEADERBOARD_CACHE_DURATION,
});

module.exports = { getLeaderboard, getSeasons };
