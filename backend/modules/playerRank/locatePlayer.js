const { isAccountIdentifier, normalizePlatform } = require("../playerIdentity");
const { nameVariants } = require("./nameVariants");

// Stadia is left out: the service is gone, so a hit there would send someone to
// a profile that stopped changing in 2023. The order is the order hits are shown.
const LIVE_PLATFORMS = ["steam", "psn", "xbox", "kakao"];

// Steam and Kakao are one PC account space: a name resolves to the same account
// id on both shards, and its matches exist only on the shard the player uses.
const PC_PLATFORMS = ["steam", "kakao"];

const MAX_SUGGESTIONS = 3;

const matchCount = (record) => {
  const matches = record?.relationships?.matches?.data;
  return Array.isArray(matches) ? matches.length : null;
};

function createLocatePlayer({ resolvePlayerBatch, getProfileRecord, isRateLimited }) {
  const recentMatches = (platform, accountId) => matchCount(getProfileRecord(platform, accountId));

  // Both PC shards answering with one account is one player, not two: keep the
  // shard that holds its matches, and Steam when neither shows any.
  const collapsePcAccount = (hits) => {
    const [steam, kakao] = PC_PLATFORMS.map((pc) => hits.find((hit) => hit.platform === pc));
    if (!steam || !kakao || steam.accountId !== kakao.accountId) return hits;
    const playsOnKakao = (kakao.matches ?? 0) > 0 && (steam.matches ?? 0) === 0;
    const drop = playsOnKakao ? steam : kakao;
    return hits.filter((hit) => hit !== drop);
  };

  const publicHit = ({ platform, name, matches }) => ({ platform, name, matches });

  return async function locatePlayer(platform, gameId) {
    const name = String(gameId || "").trim();
    if (!name || isAccountIdentifier(name) || isRateLimited()) {
      return { found: [], suggestions: [], complete: false };
    }

    const searched = normalizePlatform(platform);
    const targets = PC_PLATFORMS.includes(searched)
      ? LIVE_PLATFORMS.filter((candidate) => !PC_PLATFORMS.includes(candidate))
      : LIVE_PLATFORMS.filter((candidate) => candidate !== searched);
    const variants = LIVE_PLATFORMS.includes(searched) ? nameVariants(name) : [];

    const [spellings, ...elsewhere] = await Promise.allSettled([
      variants.length ? resolvePlayerBatch(searched, variants) : Promise.resolve({ resolved: [] }),
      ...targets.map((candidate) => resolvePlayerBatch(candidate, [name])),
    ]);

    // resolvePlayerBatch reports "missing" without asking PUBG during a cooldown,
    // so one that began mid-lookup leaves "not there" unproven.
    let complete = !isRateLimited() && spellings.status === "fulfilled";

    const hits = [];
    elsewhere.forEach((outcome, index) => {
      if (outcome.status === "rejected") {
        complete = false;
        return;
      }
      const hit = outcome.value?.resolved?.[0];
      if (!hit?.name) return;
      const target = targets[index];
      hits.push({ platform: target, name: hit.name, accountId: hit.accountId, matches: recentMatches(target, hit.accountId) });
    });

    // An account idle for the whole two-week window may well be someone else's,
    // so the active ones lead and the list stays short.
    const suggestions = (spellings.status === "fulfilled" ? spellings.value?.resolved || [] : [])
      .filter((hit) => hit?.name)
      .map((hit) => ({ platform: searched, name: hit.name, matches: recentMatches(searched, hit.accountId) }))
      .sort((a, b) => (b.matches ?? -1) - (a.matches ?? -1))
      .slice(0, MAX_SUGGESTIONS);

    return { found: collapsePcAccount(hits).map(publicHit), suggestions, complete };
  };
}

module.exports = { createLocatePlayer, LIVE_PLATFORMS };
