const { param, query, validationResult } = require("express-validator");
const MESSAGE = require("../constant/responseMessage");
const { getLeaderboard, getSeasons } = require("../modules/getLeaderboard");
const { LEADERBOARD_REGIONS } = require("../modules/leaderboard/regions");

const GAME_MODES = ["solo", "solo-fpp", "duo", "duo-fpp", "squad", "squad-fpp"];

module.exports.getLeaderboard = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }
    const { platform, gameMode } = req.params;
    const seasonId = (req.query && req.query.season) || null;
    const data = await getLeaderboard({ platform, gameMode, seasonId });
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getSeasons = async (req, res) => {
  try {
    const { platform } = req.params;
    const data = await getSeasons(platform);
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.GAME_MODES = GAME_MODES;

module.exports.validate = (method) => {
  switch (method) {
    case "getLeaderboard":
      return [
        param("platform").isIn(LEADERBOARD_REGIONS),
        param("gameMode").isIn(GAME_MODES),
        // Shaped, not just length-capped: the value is part of the cache key and
        // of the upstream URL, and every novel one spends a PUBG request from
        // the key the live site shares -- which can trip the rate-limit cooldown
        // rank lookups read.
        query("season")
          .optional({ nullable: true })
          .isString()
          .trim()
          .matches(/^division\.bro\.official\.[a-z0-9.-]{1,48}$/i),
      ];
    default:
      return [];
  }
};
