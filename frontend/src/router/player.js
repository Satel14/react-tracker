const PlayerContoller = require("../contollers/player");

module.exports = (router) => {
  router.post(
    "/api/player/rank",
    PlayerContoller.validate("getPlayerData"),
    PlayerContoller.getPlayerdata
  );
};
