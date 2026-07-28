const PlayerController = require("../controllers/player");
const { heatmapAggregateLimiter } = require("../modules/heatmapAggregateRateLimiter");

module.exports = (router) => {
  router.post(
    "/api/player/rank",
    PlayerController.validate("getPlayerData"),
    PlayerController.getPlayerData
  );
  router.post("/api/player/extras", PlayerController.validate("getPlayerExtras"), PlayerController.getPlayerExtras);
  router.post("/api/player/resolve", PlayerController.validate("resolvePlayers"), PlayerController.resolvePlayers);
  router.post(
    "/api/player/steamid",
    PlayerController.validate("getPlayerSteamName"),
    PlayerController.getPlayerSteamName
  );
  router.post(
    "/api/player/reports",
    PlayerController.validate("getPlayerReports"),
    PlayerController.getPlayerReports
  );
  router.get(
    "/api/player/live",
    PlayerController.getLiveSnapshot
  );
  router.get(
    "/api/player/recent",
    PlayerController.getRecentSearches
  );
  router.get(
    "/api/match/:matchId/replay",
    PlayerController.validate("getMatchReplay"),
    PlayerController.getMatchReplay
  );
  router.get(
    "/api/match/:matchId/analysis",
    PlayerController.validate("getMatchAnalysis"),
    PlayerController.getMatchAnalysis
  );
  router.post(
    "/api/player/heatmap/aggregate",
    heatmapAggregateLimiter,
    PlayerController.validate("getPlayerHeatmapAggregate"),
    PlayerController.getPlayerHeatmapAggregate
  );
  router.get(
    "/api/player/:platform/:gameId/card.png",
    PlayerController.getPlayerCard
  );
};
