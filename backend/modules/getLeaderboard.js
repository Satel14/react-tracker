const { createPubgApiClient } = require("./playerRank/pubgApi");
const { createLeaderboardService } = require("./leaderboard/leaderboardService");
const { getSeasonCatalog } = require("./getSeasonCatalog");
const {
  leaderboardCache,
  LEADERBOARD_CACHE_DURATION,
  setRateLimited,
} = require("./playerRank/state");

const PUBG_API_KEY = process.env.PUBG_API_KEY;

const { doRequest } = createPubgApiClient({
  apiKey: PUBG_API_KEY,
  onRateLimit: setRateLimited,
});

const { getLeaderboard, getSeasons } = createLeaderboardService({
  doRequest,
  getSeasonCatalog,
  leaderboardCache,
  cacheDuration: LEADERBOARD_CACHE_DURATION,
});

module.exports = { getLeaderboard, getSeasons };
