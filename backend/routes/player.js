const PlayerContoller = require("../controllers/player");

module.exports = (router) => {
  router.post(
    "/api/player/rank",
    PlayerContoller.validate("getPlayerData"),
    PlayerContoller.getPlayerdata
  );
};
