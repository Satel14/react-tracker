const { body, validationResult } = require("express-validator");
const MESSAGE = require("../constant/responseMessage")
const ANY_CONFIG = require("../constant/anyConfig")
const { parsePlayerRank } = require("../modules/getPlayerRank")

module.exports.getPlayerData = async (req, res) => {
  try {
    const error = validationResult(req);

    if (!error.isEmpty()) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }
    const { platform, gameId } = req.body;
    const data = await parsePlayerRank(platform, gameId);

    return res.status(200).json({ status: 200, data: data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getPlayerSteamName = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }

    let { text } = req.body;

    if (text.search(/steamcommunity.com/) !== -1) {
      text = await getPlayerSteamNameByUrl(text);
      return res.status(200).json({ status: 200, data: text });
    }

    return res.status(200).json({ status: 200 });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.validate = (method) => {
  switch (method) {
    case "getPlayerData": {
      return [
        body("platform").exists().isIn(ANY_CONFIG.PLATFORMS),
        body("gameId").exists().isString(),
      ];
    }
    case "getPlayerSteamName": {
      return [body("text").exists().isString()];
    }
    default:
      break;
  }
};
