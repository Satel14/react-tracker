const { buildRankBadgeData } = require("../playerRank/ranked");

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toRank(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapLeaderboard(raw) {
  const included = Array.isArray(raw && raw.included) ? raw.included : [];
  return included
    .filter((item) => item && item.type === "player")
    .map((item) => {
      const attrs = item.attributes || {};
      const stats = attrs.stats || {};
      const tier = typeof stats.tier === "string" ? stats.tier : "";
      const subTier = stats.subTier != null ? String(stats.subTier) : "";
      const badge = tier ? buildRankBadgeData(tier, subTier) : null;
      return {
        rank: toRank(attrs.rank),
        accountId: item.id || null,
        name: typeof attrs.name === "string" ? attrs.name : "",
        rankPoints: toNum(stats.rankPoints),
        tier,
        subTier,
        tierIconUrl: badge ? badge.iconUrl : null,
        tierIconFallbackUrl: badge ? badge.iconFallbackUrl : null,
        games: toNum(stats.games),
        wins: toNum(stats.wins),
        winRatio: toNum(stats.winRatio),
        kda: toNum(stats.kda),
        avgDamage: toNum(stats.averageDamage),
        avgRank: toNum(stats.averageRank),
        kills: toNum(stats.kills),
      };
    })
    .sort((a, b) => {
      const ra = a.rank === null ? Infinity : a.rank;
      const rb = b.rank === null ? Infinity : b.rank;
      return ra - rb;
    });
}

module.exports = { mapLeaderboard };
