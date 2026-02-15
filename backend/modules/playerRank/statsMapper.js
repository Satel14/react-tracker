const { buildFallbackAvatarDataUri } = require("./avatar");
const { extractRankedInfo } = require("./ranked");
const { toSeasonLabel } = require("./season");

function formatSurvivalTime(seconds) {
  const totalSeconds = Number(seconds) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function aggregateModeStats(gameModeStats = {}) {
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

  return {
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
}

function combineAggregatedStats(a, b) {
  const merged = {
    totalKills: (a?.totalKills || 0) + (b?.totalKills || 0),
    totalWins: (a?.totalWins || 0) + (b?.totalWins || 0),
    totalTime: (a?.totalTime || 0) + (b?.totalTime || 0),
    totalDamage: (a?.totalDamage || 0) + (b?.totalDamage || 0),
    totalMatches: (a?.totalMatches || 0) + (b?.totalMatches || 0),
    totalHeadshots: (a?.totalHeadshots || 0) + (b?.totalHeadshots || 0),
    maxKillDistance: Math.max(a?.maxKillDistance || 0, b?.maxKillDistance || 0),
    totalRevives: (a?.totalRevives || 0) + (b?.totalRevives || 0),
    totalAssists: (a?.totalAssists || 0) + (b?.totalAssists || 0),
    totalDBNOs: (a?.totalDBNOs || 0) + (b?.totalDBNOs || 0),
    totalHeals: (a?.totalHeals || 0) + (b?.totalHeals || 0),
    totalBoosts: (a?.totalBoosts || 0) + (b?.totalBoosts || 0),
    totalVehicleDestroys: (a?.totalVehicleDestroys || 0) + (b?.totalVehicleDestroys || 0),
    totalRoadKills: (a?.totalRoadKills || 0) + (b?.totalRoadKills || 0),
    totalTop10s: (a?.totalTop10s || 0) + (b?.totalTop10s || 0),
    totalTeamKills: (a?.totalTeamKills || 0) + (b?.totalTeamKills || 0),
    totalSuicides: (a?.totalSuicides || 0) + (b?.totalSuicides || 0),
    longestSurvival: Math.max(a?.longestSurvival || 0, b?.longestSurvival || 0),
  };

  const totalDeaths = Math.max(merged.totalMatches - merged.totalWins, 0);
  const kd = totalDeaths > 0 ? Number((merged.totalKills / totalDeaths).toFixed(2)) : Number(merged.totalKills.toFixed(2));
  const avgDamage = merged.totalMatches > 0 ? Number((merged.totalDamage / merged.totalMatches).toFixed(0)) : 0;
  const wlPercentage = merged.totalMatches > 0 ? Number(((merged.totalWins / merged.totalMatches) * 100).toFixed(1)) : 0;
  const killsPerMatch = merged.totalMatches > 0 ? Number((merged.totalKills / merged.totalMatches).toFixed(2)) : 0;
  const top10Rate = merged.totalMatches > 0 ? Number(((merged.totalTop10s / merged.totalMatches) * 100).toFixed(1)) : 0;
  const headshotRate = merged.totalKills > 0 ? Number(((merged.totalHeadshots / merged.totalKills) * 100).toFixed(1)) : 0;

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

function mapAggregatedStatsToFrontend(aggregated) {
  return {
    timePlayed: {
      displayValue: Math.round(aggregated.totalTime / 3600) + "h",
      value: aggregated.totalTime,
    },
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
    mvp: {
      displayValue: aggregated.totalRevives.toLocaleString(),
      value: aggregated.totalRevives,
    },
    headshotPct: {
      displayValue: aggregated.totalHeadshots.toLocaleString(),
      value: aggregated.totalHeadshots,
    },
    headshotRate: {
      displayValue: aggregated.headshotRate + "%",
      value: aggregated.headshotRate,
    },
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
    longestKill: {
      displayValue: Math.round(aggregated.maxKillDistance) + "m",
      value: aggregated.maxKillDistance,
    },
    longestSurvival: {
      displayValue: formatSurvivalTime(aggregated.longestSurvival),
      value: aggregated.longestSurvival,
    },
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
    heals: {
      displayValue: aggregated.totalHeals.toLocaleString(),
      value: aggregated.totalHeals,
    },
    boosts: {
      displayValue: aggregated.totalBoosts.toLocaleString(),
      value: aggregated.totalBoosts,
    },
    vehicleDestroys: {
      displayValue: aggregated.totalVehicleDestroys.toLocaleString(),
      value: aggregated.totalVehicleDestroys,
    },
    roadKills: {
      displayValue: aggregated.totalRoadKills.toLocaleString(),
      value: aggregated.totalRoadKills,
    },
    teamKills: {
      displayValue: aggregated.totalTeamKills.toLocaleString(),
      value: aggregated.totalTeamKills,
    },
    suicides: {
      displayValue: aggregated.totalSuicides.toLocaleString(),
      value: aggregated.totalSuicides,
    },
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
  avatarUrl = null
) {
  const lifetimeAggregated = aggregateModeStats(lifetimeStats.gameModeStats);
  const finalAvatarUrl = avatarUrl || buildFallbackAvatarDataUri(playerName);
  const seasons = seasonCatalog?.seasons || [];
  const currentSeasonId = seasonCatalog?.currentSeasonId || null;
  const effectiveSelectedSeasonId = selectedSeasonId || currentSeasonId;

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
  };

  if (
    seasonData &&
    seasonData.attributes &&
    (seasonData.attributes.gameModeStats || rankedSeasonData?.attributes?.rankedGameModeStats)
  ) {
    const normalModeStats = seasonData.attributes.gameModeStats || {};
    const rankedModeStats = rankedSeasonData?.attributes?.rankedGameModeStats || {};
    const hasRanked = Object.keys(rankedModeStats).length > 0;
    const rankedInfo = hasRanked ? extractRankedInfo(rankedModeStats) : null;

    const normalAggregated = aggregateModeStats(normalModeStats);
    const rankedAggregated = hasRanked ? aggregateModeStats(rankedModeStats) : null;
    const combinedAggregated = hasRanked
      ? combineAggregatedStats(normalAggregated, rankedAggregated)
      : normalAggregated;

    const combinedModeStats = hasRanked ? mergeModeStatsMaps(normalModeStats, rankedModeStats) : normalModeStats;

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
};
