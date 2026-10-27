// The numbers a season recap is made of, taken from the profile payload the
// page already has. Nothing here costs a request.

const numberOf = (stat) => {
  const value = stat?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

// Ranked mode reports most-kills and longest-kill as a literal 0 whatever the
// player did, so records only come from normal matches -- where a 0 means no
// record rather than a record of nothing.
const recordOf = (stat) => {
  const value = numberOf(stat);
  return value && value > 0 ? value : null;
};

// The image may only embed what this site serves: a root-relative path, never a
// protocol-relative or absolute URL.
const sameOriginPath = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;

export const seasonNumberOf = (seasonId) => {
  const match = typeof seasonId === "string" ? seasonId.match(/(\d+)\s*$/) : null;
  return match ? Number(match[1]) : null;
};

export const seasonRecap = (season) => {
  const info = season?.rankedInfo;
  if (!info) return null;

  const ranked = season?.breakdown?.ranked || {};
  const normal = season?.breakdown?.normal || {};
  const rankPoint = typeof info.currentRankPoint === "number" ? info.currentRankPoint : null;
  const best = typeof info.bestRankPoint === "number" ? info.bestRankPoint : null;

  return {
    seasonId: season.id,
    season: seasonNumberOf(season.id),
    finished: !season.isCurrentSeason,
    tier: String(info.tier || "").toLowerCase(),
    tierLabel: info.label || null,
    iconUrl: sameOriginPath(info.iconUrl) || sameOriginPath(info.iconFallbackUrl),
    rankPoint,
    // Only a peak above where the season ended says something new.
    peakRankPoint: best !== null && rankPoint !== null && best > rankPoint ? best : null,
    ranked: {
      matches: numberOf(ranked.matchesPlayed),
      wins: numberOf(ranked.wins),
      top10Rate: numberOf(ranked.top10Rate),
      kd: numberOf(ranked.kd),
      avgDamage: numberOf(ranked.avgDamage),
      avgPlace: typeof info.avgRank === "number" ? info.avgRank : null,
    },
    records: {
      mostKills: recordOf(normal.bestGameKills),
      longestKill: recordOf(normal.longestKill),
    },
  };
};

export const previousSeason = (seasonId, seasons) => {
  const number = seasonNumberOf(seasonId);
  if (number === null || !Array.isArray(seasons)) return null;
  return seasons.find((item) => item?.seasonNumber === number - 1) || null;
};
