const LeaderboardController = require("../controllers/leaderboard");

module.exports = (router) => {
  router.get(
    "/api/leaderboard/:platform/:gameMode",
    LeaderboardController.validate("getLeaderboard"),
    LeaderboardController.getLeaderboard
  );
  router.get(
    "/api/seasons/:platform",
    LeaderboardController.getSeasons
  );
};
