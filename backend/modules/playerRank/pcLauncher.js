const { normalizePlatform } = require("../playerIdentity");
const { isStrictAccountId } = require("../pubgUrlSafety");

// Steam and Kakao are one PC account space: the same account id answers on
// both shards, and its matches exist only on the shard the player launches
// through. An empty profile on one may be a full one on the other.
const OTHER_LAUNCHER = { steam: "kakao", kakao: "steam" };

const matchCount = (record) => {
  const matches = record?.relationships?.matches?.data;
  return Array.isArray(matches) ? matches.length : 0;
};

function createPcLauncherCheck({ getPlayerProfile, isRateLimited }) {
  return async function checkPcLauncher(platform, accountId) {
    const other = OTHER_LAUNCHER[normalizePlatform(platform)];
    if (!other || !isStrictAccountId(accountId) || isRateLimited()) return null;

    let record = null;
    try {
      record = await getPlayerProfile(other, accountId);
    } catch {
      return null;
    }

    const matches = matchCount(record);
    return matches > 0 ? { platform: other, matches } : null;
  };
}

module.exports = { createPcLauncherCheck };
