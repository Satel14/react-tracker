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
      return {
        rank: toRank(attrs.rank),
        accountId: item.id || null,
        name: typeof attrs.name === "string" ? attrs.name : "",
        rankPoints: toNum(stats.rankPoints),
        games: toNum(stats.games),
        wins: toNum(stats.wins),
        winRatio: toNum(stats.winRatio),
        kda: toNum(stats.kda),
        avgDamage: toNum(stats.averageDamage),
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
