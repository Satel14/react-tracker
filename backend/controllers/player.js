const { validationResult, body, check, query, param } = require("express-validator");
const MESSAGE = require("../constant/responseMessage")
const ANY_CONFIG = require("../constant/anyConfig")
const { parsePlayerRank, getPlayerExtras, resolvePlayerBatch } = require("../modules/getPlayerRank")
const { getLiveSnapshot } = require("../modules/getLiveSnapshot")
const { getPlayerReports } = require("../modules/getPlayerReports")
const { addRecentSearch, getRecentSearches } = require("../modules/recentSearches")
const { getPlayerSteamNameByUrl, isAllowedSteamUrl } = require("../modules/getPlayerSteamNameByUrl")
const { isAccountIdentifier } = require("../modules/playerIdentity");
const { warmHeatmapMatches, shardForMatch } = require("../modules/getMatchHeatmap");
const { getMatchReplay } = require("../modules/getMatchReplay");
const { getMatchAnalysis } = require("../modules/getMatchAnalysis");
const { getMapMeta } = require("../modules/mapMeta");
const { aggregateKey, getAggregate } = require("../modules/heatmapAggregate");
const { getPlayerCard } = require("../modules/getPlayerCard");
const { ALLOWED_SHARDS } = require("../modules/pubgUrlSafety");

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

      const rankedInfo = data?.data?.season?.rankedInfo || null;
      await addRecentSearch({
        gameId: canonicalHandle,
        platform: platform || platformInfo.platformSlug || "steam",
        nickname: canonicalHandle,
        avatar: platformInfo.avatarUrl || null,
        rating: rankedInfo?.currentRankPoint ?? null,
        rankIconUrl: rankedInfo?.iconUrl || rankedInfo?.iconFallbackUrl || null,
        rankLabel: rankedInfo?.label || null,
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

    if (isAllowedSteamUrl(text) && text.search(/steamcommunity\.com/) !== -1) {
      const data = await getPlayerSteamNameByUrl(text);
      return res.status(200).json({ status: 200, data });
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
    const data = await getRecentSearches(10);
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getPlayerExtras = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }

    const { platform, gameId } = req.body;
    const data = await getPlayerExtras(platform, gameId);
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.resolvePlayers = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res
        .status(422)
        .json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }

    const { platform, gameIds } = req.body;
    const data = await resolvePlayerBatch(platform, gameIds);
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getPlayerCard = async (req, res) => {
  try {
    const { platform, gameId } = req.params || {};
    if (!platform || !gameId) {
      return res.status(400).send("platform and gameId are required");
    }

    const buffer = await getPlayerCard({ platform, gameId });
    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
      "Content-Length": buffer.length,
    });
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(500).send(`Card unavailable: ${e.message}`);
  }
};

module.exports.getMatchReplay = async (req, res) => {
  try {
    const error = validationResult(req);
    if (!error.isEmpty()) {
      return res.status(422).json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }
    const { matchId } = req.params || {};
    const { shard, accountId, playerName } = req.query || {};
    if (!matchId) {
      return res.status(400).json({ status: 400, message: "matchId is required" });
    }
    const data = await getMatchReplay({
      shard: shard || "steam",
      matchId,
      accountId: accountId || null,
      playerName: playerName || null,
    });
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getMatchAnalysis = async (req, res) => {
  try {
    const error = validationResult(req);
    if (!error.isEmpty()) {
      return res.status(422).json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
    }
    const { matchId } = req.params || {};
    const { shard, accountId, playerName } = req.query || {};
    if (!matchId) {
      return res.status(400).json({ status: 400, message: "matchId is required" });
    }
    const data = await getMatchAnalysis({
      shard: shard || "steam",
      matchId,
      accountId: accountId || null,
      playerName: playerName || null,
    });
    return res.status(200).json({ status: 200, data });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.getPlayerHeatmapAggregate = async (req, res) => {
  try {
    const { shard = "steam", accountId = null, playerName = null, map = null, matchIds = [] } = req.body || {};
    if (!accountId && !playerName) {
      return res.status(400).json({ status: 400, message: "accountId or playerName is required" });
    }
    if (!map) {
      return res.status(400).json({ status: 400, message: "map is required" });
    }

    await warmHeatmapMatches({ shard, matchIds, accountId, playerName });

    const key = aggregateKey({ shard: shardForMatch(shard), accountId, playerName, rawMapName: map });
    const aggregate = await getAggregate({ key });
    return res.status(200).json({
      status: 200,
      data: {
        map,
        mapMax: getMapMeta(map).mapMax,
        layers: aggregate.layers,
        matchesCount: aggregate.matchesCount,
      },
    });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};

module.exports.validate = (method) => {
  switch (method) {
    case "getPlayerData": {
      return [
        body("platform").exists().isIn(ANY_CONFIG.PLATFORMS),
        body("gameId").exists().isString().isLength({ min: 1, max: 64 }),
        body("seasonId").optional({ nullable: true }).isString().isLength({ max: 64 }),
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
    case "getPlayerExtras": {
      return [
        body("platform").exists().isIn(ANY_CONFIG.PLATFORMS),
        body("gameId").exists().isString().isLength({ min: 1, max: 64 }),
      ];
    }
    case "resolvePlayers": {
      return [
        body("platform").exists().isIn(ANY_CONFIG.PLATFORMS),
        body("gameIds").exists().isArray({ min: 1, max: 10 }),
        body("gameIds.*").isString().isLength({ min: 1, max: 64 }),
      ];
    }
    case "getMatchReplay":
    case "getMatchAnalysis": {
      return [
        param("matchId").exists().isString().trim().isLength({ min: 1, max: 64 }),
        query("shard").optional({ nullable: true }).isIn(ALLOWED_SHARDS),
        query("accountId").optional({ nullable: true }).isString().trim().isLength({ max: 64 }),
        query("playerName").optional({ nullable: true }).isString().trim().isLength({ max: 64 }),
      ];
    }
    default:
      break;
  }
};
