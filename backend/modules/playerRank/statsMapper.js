const { buildFallbackAvatarDataUri } = require("./avatar");
const { extractRankedInfo } = require("./ranked");
const { toSeasonLabel } = require("./season");

const UNKNOWN_DISPLAY = "—";

// Verified against live rankedGameModeStats payloads (steam/Satel14 and
// steam/CHESTER93, 2026-07-28): ranked only populates kills, deaths, damageDealt,
// dBNOs, assists, wins, roundsPlayed and top10Ratio. Every aggregate listed here
// comes back as a literal 0, so a ranked source must never feed it — summing the
// zeros in poisoned the combined season rates (a 75% headshot rate read as 1.9%).
const RANKED_UNREPORTED_FIELDS = [
  "totalHeadshots",
  "totalTime",
  "maxKillDistance",
  "longestSurvival",
  "totalRevives",
  "totalHeals",
  "totalBoosts",
  "totalTeamKills",
  "totalVehicleDestroys",
  "totalRoadKills",
  "totalSuicides",
];

function formatSurvivalTime(seconds) {
  const totalSeconds = Number(seconds) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function isReported(source, field) {
  return Boolean(source) && source[field] !== null && source[field] !== undefined;
}

const sumValues = (values) => values.reduce((acc, value) => acc + value, 0);
const maxValues = (values) => values.reduce((acc, value) => Math.max(acc, value), 0);

// Only the sources that report a field may contribute to it; when none of them
// has a single match behind it there is nothing to show, hence null (em dash).
function combineReportedField(sources, field, reduce) {
  const reporting = sources.filter((source) => isReported(source, field));
  if (!reporting.length) return null;
  if (!reporting.some((source) => (source.totalMatches || 0) > 0)) return null;
  return reduce(reporting.map((source) => Number(source[field]) || 0));
}

function aggregateModeStats(gameModeStats = {}, { unreportedFields = [] } = {}) {
  let totalKills = 0;
  let totalWins = 0;
  let totalTime = 0;
  let totalDamage = 0;
  let totalMatches = 0;
  let totalHeadshots = 0;
  let maxKillDistance = 0;
  let totalRevives = 0;
  let totalAssists = 0;
  let totalDBNOs = 0;
  let totalHeals = 0;
  let totalBoosts = 0;
  let totalVehicleDestroys = 0;
  let totalRoadKills = 0;
  let totalTop10s = 0;
  let totalTeamKills = 0;
  let totalSuicides = 0;
  let longestSurvival = 0;

  const modes = Object.values(gameModeStats || {});

  modes.forEach((mode) => {
    totalKills += mode.kills || 0;
    totalWins += mode.wins || 0;
    totalTime += mode.timeSurvived || 0;
    totalDamage += mode.damageDealt || 0;
    totalMatches += mode.roundsPlayed || 0;
    totalHeadshots += mode.headshotKills || 0;
    totalRevives += mode.revives || 0;
    totalAssists += mode.assists || 0;
    totalDBNOs += mode.dBNOs || 0;
    totalHeals += mode.heals || 0;
    totalBoosts += mode.boosts || 0;
    totalVehicleDestroys += mode.vehicleDestroys || 0;
    totalRoadKills += mode.roadKills || 0;
    totalTop10s += mode.top10s || 0;
    totalTeamKills += mode.teamKills || 0;
    totalSuicides += mode.suicides || 0;
    if ((mode.longestKill || 0) > maxKillDistance) maxKillDistance = mode.longestKill || 0;
    if ((mode.longestTimeSurvived || 0) > longestSurvival) longestSurvival = mode.longestTimeSurvived || 0;
  });

  const totalDeaths = Math.max(totalMatches - totalWins, 0);
  const kd = totalDeaths > 0 ? Number((totalKills / totalDeaths).toFixed(2)) : Number(totalKills.toFixed(2));
  const avgDamage = totalMatches > 0 ? Number((totalDamage / totalMatches).toFixed(0)) : 0;
  const wlPercentage = totalMatches > 0 ? Number(((totalWins / totalMatches) * 100).toFixed(1)) : 0;
  const killsPerMatch = totalMatches > 0 ? Number((totalKills / totalMatches).toFixed(2)) : 0;
  const top10Rate = totalMatches > 0 ? Number(((totalTop10s / totalMatches) * 100).toFixed(1)) : 0;
  const headshotRate = totalKills > 0 ? Number(((totalHeadshots / totalKills) * 100).toFixed(1)) : 0;

  const aggregated = {
    totalKills,
    totalDeaths,
    totalWins,
    totalTime,
    totalDamage,
    totalMatches,
    totalHeadshots,
    maxKillDistance,
    totalRevives,
    totalAssists,
    totalDBNOs,
    totalHeals,
    totalBoosts,
    totalVehicleDestroys,
    totalRoadKills,
    totalTop10s,
    totalTeamKills,
    totalSuicides,
    longestSurvival,
    kd,
    avgDamage,
    wlPercentage,
    killsPerMatch,
    top10Rate,
    headshotRate,
  };

  unreportedFields.forEach((field) => {
    aggregated[field] = null;
  });
  if (aggregated.totalHeadshots === null) aggregated.headshotRate = null;

  return aggregated;
}

function combineAggregatedStats(a, b) {
  const sources = [a, b].filter(Boolean);
  const merged = {
    totalKills: (a?.totalKills || 0) + (b?.totalKills || 0),
    totalWins: (a?.totalWins || 0) + (b?.totalWins || 0),
    totalTime: combineReportedField(sources, "totalTime", sumValues),
    totalDamage: (a?.totalDamage || 0) + (b?.totalDamage || 0),
    totalMatches: (a?.totalMatches || 0) + (b?.totalMatches || 0),
    totalHeadshots: combineReportedField(sources, "totalHeadshots", sumValues),
    maxKillDistance: combineReportedField(sources, "maxKillDistance", maxValues),
    totalRevives: combineReportedField(sources, "totalRevives", sumValues),
    totalAssists: (a?.totalAssists || 0) + (b?.totalAssists || 0),
    totalDBNOs: (a?.totalDBNOs || 0) + (b?.totalDBNOs || 0),
    totalHeals: combineReportedField(sources, "totalHeals", sumValues),
    totalBoosts: combineReportedField(sources, "totalBoosts", sumValues),
    totalVehicleDestroys: combineReportedField(sources, "totalVehicleDestroys", sumValues),
    totalRoadKills: combineReportedField(sources, "totalRoadKills", sumValues),
    totalTop10s: (a?.totalTop10s || 0) + (b?.totalTop10s || 0),
    totalTeamKills: combineReportedField(sources, "totalTeamKills", sumValues),
    totalSuicides: combineReportedField(sources, "totalSuicides", sumValues),
    longestSurvival: combineReportedField(sources, "longestSurvival", maxValues),
  };

  // Headshots are only known for the kills of the sources that report them, so
  // ranked kills must stay out of the denominator.
  const headshotKillSample = sources.reduce(
    (acc, source) => acc + (isReported(source, "totalHeadshots") ? source.totalKills || 0 : 0),
    0
  );

  const totalDeaths = Math.max(merged.totalMatches - merged.totalWins, 0);
  const kd = totalDeaths > 0 ? Number((merged.totalKills / totalDeaths).toFixed(2)) : Number(merged.totalKills.toFixed(2));
  const avgDamage = merged.totalMatches > 0 ? Number((merged.totalDamage / merged.totalMatches).toFixed(0)) : 0;
  const wlPercentage = merged.totalMatches > 0 ? Number(((merged.totalWins / merged.totalMatches) * 100).toFixed(1)) : 0;
  const killsPerMatch = merged.totalMatches > 0 ? Number((merged.totalKills / merged.totalMatches).toFixed(2)) : 0;
  const top10Rate = merged.totalMatches > 0 ? Number(((merged.totalTop10s / merged.totalMatches) * 100).toFixed(1)) : 0;
  const headshotRate =
    merged.totalHeadshots === null
      ? null
      : headshotKillSample > 0
        ? Number(((merged.totalHeadshots / headshotKillSample) * 100).toFixed(1))
        : 0;

  return {
    ...merged,
    totalDeaths,
    kd,
    avgDamage,
    wlPercentage,
    killsPerMatch,
    top10Rate,
    headshotRate,
  };
}

function mergeModeStatsMaps(normal = {}, ranked = {}) {
  const sumFields = [
    "kills",
    "wins",
    "timeSurvived",
    "damageDealt",
    "roundsPlayed",
    "headshotKills",
    "revives",
    "assists",
    "dBNOs",
    "heals",
    "boosts",
    "vehicleDestroys",
    "roadKills",
    "top10s",
    "teamKills",
    "suicides",
  ];
  const maxFields = ["longestKill", "longestTimeSurvived"];

  const merged = {};
  const keys = new Set([...Object.keys(normal || {}), ...Object.keys(ranked || {})]);

  keys.forEach((modeKey) => {
    const left = normal?.[modeKey] || {};
    const right = ranked?.[modeKey] || {};
    const modeResult = {};

    sumFields.forEach((field) => {
      modeResult[field] = Number(left[field] || 0) + Number(right[field] || 0);
    });
    maxFields.forEach((field) => {
      modeResult[field] = Math.max(Number(left[field] || 0), Number(right[field] || 0));
    });

    merged[modeKey] = modeResult;
  });

  return merged;
}

// DATA-GATED: PUBG's rankedGameModeStats uses a different schema than the
// lifetime/season gameModeStats. Ranked exposes playTime (seconds), top10Ratio
// and avgSurvivalTime instead of timeSurvived / top10s, and omits roadKills,
// vehicleDestroys, suicides and longestTimeSurvived. Map ranked field names onto
// the normal-mode schema so aggregation and merging sum compatible units.
// Validated against live ranked payloads (2026-07-28): these field names are
// correct, but PUBG returns a literal 0 for headshotKills, longestKill, playTime,
// revives, heals, boosts and teamKills, so the derived rates were the broken part
// — see RANKED_UNREPORTED_FIELDS, which keeps those zeros out of the totals.
function normalizeRankedModeStats(rankedGameModeStats = {}) {
  const normalized = {};
  Object.entries(rankedGameModeStats || {}).forEach(([modeKey, stats]) => {
    const source = stats || {};
    const roundsPlayed = Number(source.roundsPlayed) || 0;
    const top10Ratio = Number(source.top10Ratio) || 0;
    normalized[modeKey] = {
      kills: Number(source.kills) || 0,
      wins: Number(source.wins) || 0,
      timeSurvived: Number(source.playTime) || 0,
      damageDealt: Number(source.damageDealt) || 0,
      roundsPlayed,
      headshotKills: Number(source.headshotKills) || 0,
      revives: Number(source.revives) || 0,
      assists: Number(source.assists) || 0,
      dBNOs: Number(source.dBNOs) || 0,
      heals: Number(source.heals) || 0,
      boosts: Number(source.boosts) || 0,
      teamKills: Number(source.teamKills) || 0,
      top10s: Math.round(top10Ratio * roundsPlayed),
      longestKill: Number(source.longestKill) || 0,
    };
  });
  return normalized;
}

function aggregateByModePrefix(gameModeStats = {}, prefix) {
  const filteredStats = {};
  Object.entries(gameModeStats || {}).forEach(([modeKey, modeStats]) => {
    if (modeKey.toLowerCase().startsWith(prefix)) {
      filteredStats[modeKey] = modeStats;
    }
  });

  return aggregateModeStats(filteredStats);
}

function mapModeGroupsToFrontend(gameModeStats = {}) {
  const modePrefixes = ["solo", "duo", "squad"];
  const modes = {};

  modePrefixes.forEach((prefix) => {
    const aggregated = aggregateByModePrefix(gameModeStats, prefix);
    const hasData = aggregated.totalMatches > 0 || aggregated.totalKills > 0 || aggregated.totalTime > 0;
    if (!hasData) return;

    modes[prefix] = {
      stats: mapAggregatedStatsToFrontend(aggregated),
    };
  });

  return modes;
}

// An unknown stat must never render as a real measurement (0 / 0% / 0h).
function statOrUnknown(value, format) {
  if (value === null || value === undefined) {
    return { displayValue: UNKNOWN_DISPLAY, value: null };
  }
  return { displayValue: format(value), value };
}

const asCount = (value) => value.toLocaleString();

function mapAggregatedStatsToFrontend(aggregated) {
  return {
    timePlayed: statOrUnknown(aggregated.totalTime, (value) => Math.round(value / 3600) + "h"),
    kills: {
      displayValue: aggregated.totalKills.toLocaleString(),
      value: aggregated.totalKills,
    },
    deaths: {
      displayValue: aggregated.totalDeaths.toLocaleString(),
      value: aggregated.totalDeaths,
    },
    kd: {
      displayValue: aggregated.kd.toFixed(2),
      value: aggregated.kd,
    },
    wins: {
      displayValue: aggregated.totalWins.toLocaleString(),
      value: aggregated.totalWins,
    },
    matchesPlayed: {
      displayValue: aggregated.totalMatches.toLocaleString(),
      value: aggregated.totalMatches,
    },
    roundsPlayed: {
      displayValue: aggregated.totalMatches.toLocaleString(),
      value: aggregated.totalMatches,
    },
    mvp: statOrUnknown(aggregated.totalRevives, asCount),
    headshotPct: statOrUnknown(aggregated.totalHeadshots, asCount),
    headshotRate: statOrUnknown(aggregated.headshotRate, (value) => value + "%"),
    damage: {
      displayValue: Math.round(aggregated.totalDamage).toLocaleString(),
      value: aggregated.totalDamage,
    },
    avgDamage: {
      displayValue: aggregated.avgDamage.toLocaleString(),
      value: aggregated.avgDamage,
    },
    wlPercentage: {
      displayValue: aggregated.wlPercentage + "%",
      value: aggregated.wlPercentage,
    },
    top10Rate: {
      displayValue: aggregated.top10Rate + "%",
      value: aggregated.top10Rate,
    },
    killsPerMatch: {
      displayValue: aggregated.killsPerMatch.toFixed(2),
      value: aggregated.killsPerMatch,
    },
    longestKill: statOrUnknown(aggregated.maxKillDistance, (value) => Math.round(value) + "m"),
    longestSurvival: statOrUnknown(aggregated.longestSurvival, formatSurvivalTime),
    assists: {
      displayValue: aggregated.totalAssists.toLocaleString(),
      value: aggregated.totalAssists,
    },
    dbnos: {
      displayValue: aggregated.totalDBNOs.toLocaleString(),
      value: aggregated.totalDBNOs,
    },
    top10s: {
      displayValue: aggregated.totalTop10s.toLocaleString(),
      value: aggregated.totalTop10s,
    },
    heals: statOrUnknown(aggregated.totalHeals, asCount),
    boosts: statOrUnknown(aggregated.totalBoosts, asCount),
    vehicleDestroys: statOrUnknown(aggregated.totalVehicleDestroys, asCount),
    roadKills: statOrUnknown(aggregated.totalRoadKills, asCount),
    teamKills: statOrUnknown(aggregated.totalTeamKills, asCount),
    suicides: statOrUnknown(aggregated.totalSuicides, asCount),
  };
}

function mapPubgStatsToFrontend(
  lifetimeStats,
  playerName,
  accountId,
  seasonData = null,
  rankedSeasonData = null,
  seasonCatalog = null,
  selectedSeasonId = null,
  platformSlug = "steam",
  avatarUrl = null,
  profileExtras = null
) {
  const lifetimeAggregated = aggregateModeStats(lifetimeStats.gameModeStats);
  const finalAvatarUrl = avatarUrl || buildFallbackAvatarDataUri(playerName);
  const seasons = seasonCatalog?.seasons || [];
  const currentSeasonId = seasonCatalog?.currentSeasonId || null;
  const effectiveSelectedSeasonId = selectedSeasonId || currentSeasonId;
  const defaultProfile = {
    status: "not_loaded",
    error: "Profile extras were not requested or did not complete",
    banType: null,
    clan: null,
    survivalMastery: null,
    weaponMastery: null,
  };

  const data = {
    platformInfo: {
      platformSlug,
      platformUserId: accountId,
      platformUserHandle: playerName,
      platformUserIdentifier: accountId,
      avatarUrl: finalAvatarUrl,
    },
    segments: [
      {
        stats: mapAggregatedStatsToFrontend(lifetimeAggregated),
      },
    ],
    modes: mapModeGroupsToFrontend(lifetimeStats.gameModeStats),
    seasons,
    currentSeasonId,
    selectedSeasonId: effectiveSelectedSeasonId,
    profile: profileExtras?.profile || defaultProfile,
    matches: profileExtras?.matches || { summary: { total: 0 }, items: [] },
  };

  if (
    seasonData &&
    seasonData.attributes &&
    (seasonData.attributes.gameModeStats || rankedSeasonData?.attributes?.rankedGameModeStats)
  ) {
    const normalModeStats = seasonData.attributes.gameModeStats || {};
    const rankedModeStats = rankedSeasonData?.attributes?.rankedGameModeStats || {};
    const hasRanked = Object.keys(rankedModeStats).length > 0;
    // extractRankedInfo needs the RAW ranked payload (currentTier, rank points),
    // so read tier info before remapping ranked stats onto the normal schema.
    const rankedInfo = hasRanked ? extractRankedInfo(rankedModeStats) : null;
    const normalizedRankedModeStats = hasRanked ? normalizeRankedModeStats(rankedModeStats) : {};

    const normalAggregated = aggregateModeStats(normalModeStats);
    const rankedAggregated = hasRanked
      ? aggregateModeStats(normalizedRankedModeStats, { unreportedFields: RANKED_UNREPORTED_FIELDS })
      : null;
    const combinedAggregated = hasRanked
      ? combineAggregatedStats(normalAggregated, rankedAggregated)
      : normalAggregated;

    const combinedModeStats = hasRanked
      ? mergeModeStatsMaps(normalModeStats, normalizedRankedModeStats)
      : normalModeStats;

    data.season = {
      id: seasonData.id,
      label: toSeasonLabel(seasonData.id),
      isCurrentSeason: seasonData.id === currentSeasonId,
      includesRanked: hasRanked,
      rankedInfo,
      stats: mapAggregatedStatsToFrontend(combinedAggregated),
      modes: mapModeGroupsToFrontend(combinedModeStats),
      breakdown: {
        normal: mapAggregatedStatsToFrontend(normalAggregated),
        ranked: rankedAggregated ? mapAggregatedStatsToFrontend(rankedAggregated) : null,
      },
    };
  }

  return { data };
}

module.exports = {
  mapPubgStatsToFrontend,
  aggregateModeStats,
  combineAggregatedStats,
  mergeModeStatsMaps,
  normalizeRankedModeStats,
};
