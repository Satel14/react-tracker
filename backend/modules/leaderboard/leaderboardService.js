const { mapLeaderboard } = require("./leaderboardMapper");
const { resolveRegion, SEASON_SHARD } = require("./regions");

function createLeaderboardService({ doRequest, getSeasonCatalog, leaderboardCache, cacheDuration }) {
  async function getSeasons() {
    return getSeasonCatalog(SEASON_SHARD);
  }

  async function getLeaderboard({ platform, gameMode, seasonId }) {
    // `platform` here is a PUBG leaderboard region (pc-na, pc-eu, ...),
    // not an account shard; the official /leaderboards endpoint rejects steam/xbox/psn.
    const region = resolveRegion(platform);

    let targetSeasonId = seasonId || null;
    if (!targetSeasonId) {
      const catalog = await getSeasonCatalog(SEASON_SHARD);
      targetSeasonId = (catalog && catalog.currentSeasonId) || null;
    }
    if (!targetSeasonId) {
      throw new Error("No season available for leaderboard");
    }

    const cacheKey = `${region}:${gameMode}:${targetSeasonId}`;
    const cached = leaderboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data;
    }

    try {
      const url = `https://api.pubg.com/shards/${region}/leaderboards/${targetSeasonId}/${gameMode}`;
      const raw = await doRequest(url);
      const data = {
        platform: region,
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
