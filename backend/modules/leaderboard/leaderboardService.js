const { mapLeaderboard } = require("./leaderboardMapper");

function createLeaderboardService({ doRequest, getSeasonCatalog, resolveShard, leaderboardCache, cacheDuration }) {
  async function getSeasons(platform) {
    const shard = resolveShard(platform);
    return getSeasonCatalog(shard);
  }

  async function getLeaderboard({ platform, gameMode, seasonId }) {
    const shard = resolveShard(platform);

    let targetSeasonId = seasonId || null;
    if (!targetSeasonId) {
      const catalog = await getSeasonCatalog(shard);
      targetSeasonId = (catalog && catalog.currentSeasonId) || null;
    }
    if (!targetSeasonId) {
      throw new Error("No season available for leaderboard");
    }

    const cacheKey = `${shard}:${gameMode}:${targetSeasonId}`;
    const cached = leaderboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data;
    }

    try {
      const url = `https://api.pubg.com/shards/${shard}/leaderboards/${targetSeasonId}/${gameMode}`;
      const raw = await doRequest(url);
      const data = {
        platform: shard,
        gameMode,
        seasonId: targetSeasonId,
        entries: mapLeaderboard(raw),
      };
      leaderboardCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      if (cached && cached.data) {
        return cached.data;
      }
      throw error;
    }
  }

  return { getLeaderboard, getSeasons };
}

module.exports = { createLeaderboardService };
