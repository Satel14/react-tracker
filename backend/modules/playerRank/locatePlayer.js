const { isAccountIdentifier, normalizePlatform } = require("../playerIdentity");

// Stadia is left out: the service is gone, so a hit there would send someone to
// a profile that stopped changing in 2023. The order is the order hits are shown.
const LIVE_PLATFORMS = ["steam", "psn", "xbox", "kakao"];

// Steam and Kakao are one PC account space: a name resolves to the same account
// id on both shards, and its matches exist only on the shard the player uses.
const PC_PLATFORMS = ["steam", "kakao"];

const matchCount = (record) => {
  const matches = record?.relationships?.matches?.data;
  return Array.isArray(matches) ? matches.length : 0;
};

function createLocatePlayer({ resolvePlayerBatch, getProfileRecord, isRateLimited }) {
  // Both PC shards answering with one account is one player, not two: keep the
  // shard that holds its matches, and Steam when neither shows any.
  const collapsePcAccount = (hits) => {
    const [steam, kakao] = PC_PLATFORMS.map((pc) => hits.find((hit) => hit.platform === pc));
    if (!steam || !kakao || steam.accountId !== kakao.accountId) return hits;
    const playsOnKakao =
      matchCount(getProfileRecord("kakao", kakao.accountId)) > 0 &&
      matchCount(getProfileRecord("steam", steam.accountId)) === 0;
    const drop = playsOnKakao ? steam : kakao;
    return hits.filter((hit) => hit !== drop);
  };

  return async function locatePlayer(platform, gameId) {
    const name = String(gameId || "").trim();
    if (!name || isAccountIdentifier(name) || isRateLimited()) {
      return { found: [], complete: false };
    }

    const searched = normalizePlatform(platform);
    const targets = PC_PLATFORMS.includes(searched)
      ? LIVE_PLATFORMS.filter((candidate) => !PC_PLATFORMS.includes(candidate))
      : LIVE_PLATFORMS.filter((candidate) => candidate !== searched);
    const settled = await Promise.allSettled(
      targets.map((candidate) => resolvePlayerBatch(candidate, [name]))
    );

    // resolvePlayerBatch reports "missing" without asking PUBG during a cooldown,
    // so one that began mid-lookup leaves "not there" unproven.
    let complete = !isRateLimited();
    const hits = [];
    settled.forEach((outcome, index) => {
      if (outcome.status === "rejected") {
        complete = false;
        return;
      }
      const hit = outcome.value?.resolved?.[0];
      if (hit?.name) hits.push({ platform: targets[index], name: hit.name, accountId: hit.accountId });
    });

    const found = collapsePcAccount(hits).map((hit) => ({ platform: hit.platform, name: hit.name }));
    return { found, complete };
  };
}

module.exports = { createLocatePlayer, LIVE_PLATFORMS };
