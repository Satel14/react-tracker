const PlayerController = require("../controllers/player");

module.exports = (router) => {
  router.post(
    "/api/player/rank",
    PlayerController.validate("getPlayerData"),
    PlayerController.getPlayerData
  );
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
};
