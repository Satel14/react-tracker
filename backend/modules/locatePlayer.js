const { resolvePlayerBatch } = require("./getPlayerRank");
const { isRateLimited, playerProfileCache } = require("./playerRank/state");
const { createLocatePlayer } = require("./playerRank/locatePlayer");

// resolvePlayerBatch seeds this cache with every record it fetches, so the match
// counts the Steam/Kakao choice needs cost no extra request.
const getProfileRecord = (shard, accountId) =>
  playerProfileCache.get(`${shard}:${accountId}`)?.data || null;

const locatePlayer = createLocatePlayer({ resolvePlayerBatch, getProfileRecord, isRateLimited });

module.exports = { locatePlayer };
