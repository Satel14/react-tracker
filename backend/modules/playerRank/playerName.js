const { isAccountIdentifier } = require("../playerIdentity");

function getPlayerNameCacheKey(shard, accountId) {
  return `${shard}:${accountId}`;
}

function createPlayerNameService({ playerNameCache, isRateLimited, doRequest }) {
  function getCachedPlayerName(shard, accountId) {
    if (!accountId) return null;
    const key = getPlayerNameCacheKey(shard, accountId);
    const cached = playerNameCache.get(key);
    if (typeof cached !== "string") return null;
    const normalized = cached.trim();
    if (!normalized || isAccountIdentifier(normalized)) return null;
    return normalized;
  }

  function setCachedPlayerName(shard, accountId, playerName) {
    if (!accountId || typeof playerName !== "string") return;
    const normalized = playerName.trim();
    if (!normalized || isAccountIdentifier(normalized)) return;
    const key = getPlayerNameCacheKey(shard, accountId);
    playerNameCache.set(key, normalized);
  }

  async function fetchPlayerNameByAccountId(shard, accountId) {
    if (!accountId || !String(accountId).startsWith("account.")) return null;
    if (isRateLimited()) return null;

    const playerProfileUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}`;
    const playerData = await doRequest(playerProfileUrl);
    const name = playerData?.data?.attributes?.name;
    if (typeof name !== "string" || !name.trim()) return null;
    return name.trim();
  }

  async function ensurePlayerName(shard, accountId, fallbackName = "") {
    const cached = getCachedPlayerName(shard, accountId);
    if (cached) return cached;

    try {
      const resolved = await fetchPlayerNameByAccountId(shard, accountId);
      if (resolved) {
        setCachedPlayerName(shard, accountId, resolved);
        return resolved;
      }
    } catch (e) {
      console.log(`[PUBG] Player profile name unavailable for ${accountId}: ${e.message}`);
    }

    return typeof fallbackName === "string" && fallbackName.trim() ? fallbackName.trim() : accountId;
  }

  return {
    ensurePlayerName,
    getCachedPlayerName,
    setCachedPlayerName,
  };
}

module.exports = {
  createPlayerNameService,
};
