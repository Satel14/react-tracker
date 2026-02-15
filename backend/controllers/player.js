const { validationResult, body, check } = require("express-validator");
const MESSAGE = require("../constant/responseMessage")
const ANY_CONFIG = require("../constant/anyConfig")
const { parsePlayerRank } = require("../modules/getPlayerRank")
const { getLiveSnapshot } = require("../modules/getLiveSnapshot")
const { getPlayerReports } = require("../modules/getPlayerReports")
const { addRecentSearch, getRecentSearches } = require("../modules/recentSearches")
const { getPlayerSteamNameByUrl } = require("../modules/getPlayerSteamNameByUrl")

const isAccountIdentifier = (value) =>
  typeof value === "string" && /^account\./i.test(value.trim());

const getNormalDate = (time) => {
  const date = new Date(time);
  const monthOk = date.getUTCMonth();
  const day = date.getUTCDate();

  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const n = month[monthOk];
  const newdate = day + " " + n;
  return newdate;
};

module.exports.getPlayerData = async (req, res) => {
  try {
    const error = validationResult(req);

    if (!error.isEmpty()) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }
    const { platform, gameId, seasonId } = req.body;
    const data = await parsePlayerRank(platform, gameId, { seasonId });

    if (!seasonId && data?.data?.platformInfo) {
      const platformInfo = data.data.platformInfo;
      const requestedHandle = typeof gameId === "string" ? gameId.trim() : "";
      const apiHandle =
        typeof platformInfo.platformUserHandle === "string" && platformInfo.platformUserHandle.trim()
          ? platformInfo.platformUserHandle.trim()
          : "";
      const canonicalHandle =
        apiHandle && (!isAccountIdentifier(apiHandle) || isAccountIdentifier(requestedHandle))
          ? apiHandle
          : (requestedHandle || apiHandle || gameId);

      if (canonicalHandle && canonicalHandle !== platformInfo.platformUserHandle) {
        platformInfo.platformUserHandle = canonicalHandle;
      }

      addRecentSearch({
        gameId: canonicalHandle,
        platform: platform || platformInfo.platformSlug || "steam",
        nickname: canonicalHandle,
        avatar: platformInfo.avatarUrl || null,
        rating: null,
      });
    }

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

module.exports.getPlayerReports = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }

    const { accountId = null, playerName = null } = req.body;
    const hasAccountId = typeof accountId === "string" && accountId.trim().length > 0;
    const hasPlayerName = typeof playerName === "string" && playerName.trim().length > 0;

    if (!hasAccountId && !hasPlayerName) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }

    const data = await getPlayerReports({ accountId, playerName });
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getLiveSnapshot = async (_req, res) => {
  try {
    const data = await getLiveSnapshot();
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getRecentSearches = async (_req, res) => {
  try {
    const data = getRecentSearches(10);
    return res.status(200).json({ status: 200, data });
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
        body("seasonId").optional({ nullable: true }).isString(),
      ];
    }
    case "getPlayerSteamName": {
      return [body("text").exists().isString()];
    }
    case "getPlayerReports": {
      return [
        body("accountId").optional({ nullable: true }).isString(),
        body("playerName").optional({ nullable: true }).isString(),
      ];
    }
    default:
      break;
  }
};
