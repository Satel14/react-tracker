const { buildFallbackAvatarDataUri } = require("./avatar");
const { extractRankedInfo } = require("./ranked");
const { toSeasonLabel } = require("./season");

const UNKNOWN_DISPLAY = "—";

// PUBG returns a literal 0 for these in rankedGameModeStats whatever the player did,
// so a ranked source must report them as null rather than as a measured zero.
const RANKED_UNREPORTED_FIELDS = [
  "timeSurvived",
  "headshotKills",
  "revives",
  "heals",
  "boosts",
  "teamKills",
  "vehicleDestroys",
  "roadKills",
  "suicides",
  "longestKill",
  "longestTimeSurvived",
];

const sumValues = (values) => values.reduce((acc, value) => acc + value, 0);
const maxValues = (values) => values.reduce((acc, value) => Math.max(acc, value), 0);

const MODE_STAT_FIELDS = [
  { field: "kills", total: "totalKills", combine: sumValues },
  { field: "wins", total: "totalWins", combine: sumValues },
  { field: "timeSurvived", total: "totalTime", combine: sumValues },
  { field: "damageDealt", total: "totalDamage", combine: sumValues },
  { field: "roundsPlayed", total: "totalMatches", combine: sumValues },
  { field: "headshotKills", total: "totalHeadshots", combine: sumValues },
  { field: "revives", total: "totalRevives", combine: sumValues },
  { field: "assists", total: "totalAssists", combine: sumValues },
  { field: "dBNOs", total: "totalDBNOs", combine: sumValues },
  { field: "heals", total: "totalHeals", combine: sumValues },
  { field: "boosts", total: "totalBoosts", combine: sumValues },
  { field: "vehicleDestroys", total: "totalVehicleDestroys", combine: sumValues },
  { field: "roadKills", total: "totalRoadKills", combine: sumValues },
  { field: "top10s", total: "totalTop10s", combine: sumValues },
  { field: "teamKills", total: "totalTeamKills", combine: sumValues },
  { field: "suicides", total: "totalSuicides", combine: sumValues },
  { field: "longestKill", total: "maxKillDistance", combine: maxValues },
  { field: "longestTimeSurvived", total: "longestSurvival", combine: maxValues },
];

function formatSurvivalTime(seconds) {
  const totalSeconds = Number(seconds) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function isReported(source, field) {
  return Boolean(source) && source[field] !== null;
}

const isUnknown = (...values) => values.some((value) => value === null || value === undefined);

const modeHasActivity = (mode) => (Number(mode?.roundsPlayed) || 0) > 0;
const aggregateHasActivity = (aggregated) => (Number(aggregated?.totalMatches) || 0) > 0;

function reportsMeasurement(source, field, hasActivity) {
  if (!isReported(source, field)) return false;
  return hasActivity(source) || (Number(source[field]) || 0) !== 0;
}

function combineSources(sources, field, reduce, hasActivity) {
  const contributors = sources.filter((source) => reportsMeasurement(source, field, hasActivity));
  if (contributors.length) return reduce(contributors.map((source) => Number(source[field]) || 0));
  return sources.some(hasActivity) ? null : 0;
}

function headshotKillSampleOf(sources, { kills, headshots }) {
  return sumValues(
    sources.map((source) => (isReported(source, headshots) ? Number(source[kills]) || 0 : 0))
  );
}

function deriveHeadshotRate({ totalHeadshots, headshotKillSample, totalKills }) {
  if (isUnknown(totalHeadshots, headshotKillSample, totalKills)) return null;
  if (headshotKillSample > 0) return Number(((totalHeadshots / headshotKillSample) * 100).toFixed(1));
  return totalKills > 0 ? null : 0;
}

function deriveStats(totals) {
  const { totalKills, totalWins, totalMatches, totalDamage, totalTop10s } = totals;
  const totalDeaths = isUnknown(totalMatches, totalWins) ? null : Math.max(totalMatches - totalWins, 0);

  return {
    totalDeaths,
    kd: isUnknown(totalKills, totalDeaths)
      ? null
      : Number((totalDeaths > 0 ? totalKills / totalDeaths : totalKills).toFixed(2)),
    avgDamage: isUnknown(totalDamage, totalMatches)
      ? null
      : totalMatches > 0
        ? Number((totalDamage / totalMatches).toFixed(0))
        : 0,
    wlPercentage: isUnknown(totalWins, totalMatches)
      ? null
      : totalMatches > 0
        ? Number(((totalWins / totalMatches) * 100).toFixed(1))
        : 0,
    killsPerMatch: isUnknown(totalKills, totalMatches)
      ? null
      : totalMatches > 0
        ? Number((totalKills / totalMatches).toFixed(2))
        : 0,
    top10Rate: isUnknown(totalTop10s, totalMatches)
      ? null
      : totalMatches > 0
        ? Number(((totalTop10s / totalMatches) * 100).toFixed(1))
        : 0,
    headshotRate: deriveHeadshotRate(totals),
  };
}

function aggregateModeStats(gameModeStats = {}) {
  const modes = Object.values(gameModeStats || {});
  const totals = {};

  MODE_STAT_FIELDS.forEach(({ field, total, combine }) => {
    totals[total] = combineSources(modes, field, combine, modeHasActivity);
  });
  totals.headshotKillSample = headshotKillSampleOf(modes, { kills: "kills", headshots: "headshotKills" });

  return { ...totals, ...deriveStats(totals) };
}

function combineAggregatedStats(a, b) {
  const sources = [a, b].filter(Boolean);
  const totals = {};

  MODE_STAT_FIELDS.forEach(({ total, combine }) => {
    totals[total] = combineSources(sources, total, combine, aggregateHasActivity);
  });
  totals.headshotKillSample = combineSources(
    sources,
    "headshotKillSample",
    sumValues,
    aggregateHasActivity
  );

  return { ...totals, ...deriveStats(totals) };
}

// rankedGameModeStats has its own schema: top10Ratio instead of top10s, and no
// roadKills, vehicleDestroys, suicides or longestTimeSurvived at all.
function normalizeRankedModeStats(rankedGameModeStats = {}) {
  const normalized = {};
  Object.entries(rankedGameModeStats || {}).forEach(([modeKey, stats]) => {
    const source = stats || {};
    const roundsPlayed = Number(source.roundsPlayed) || 0;
    const top10Ratio = Number(source.top10Ratio) || 0;
    const mode = {
      kills: Number(source.kills) || 0,
      wins: Number(source.wins) || 0,
      damageDealt: Number(source.damageDealt) || 0,
      roundsPlayed,
      assists: Number(source.assists) || 0,
      dBNOs: Number(source.dBNOs) || 0,
      top10s: Math.round(top10Ratio * roundsPlayed),
    };
    RANKED_UNREPORTED_FIELDS.forEach((field) => {
      mode[field] = null;
    });
    normalized[modeKey] = mode;
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

function mapModeGroupsToFrontend(...modeStatSources) {
  const sources = modeStatSources.filter(Boolean);
  const modePrefixes = ["solo", "duo", "squad"];
  const modes = {};

  modePrefixes.forEach((prefix) => {
    const aggregated = sources
      .map((source) => aggregateByModePrefix(source, prefix))
      .reduce((acc, next) => (acc ? combineAggregatedStats(acc, next) : next), null);
    if (!aggregated) return;

    const hasData = aggregated.totalMatches > 0 || aggregated.totalKills > 0 || aggregated.totalTime > 0;
    if (!hasData) return;

    modes[prefix] = {
      stats: mapAggregatedStatsToFrontend(aggregated),
    };
  });

  return modes;
}

function statOrUnknown(value, format) {
  if (value === null || value === undefined) {
    return { displayValue: UNKNOWN_DISPLAY, value: null };
  }
  return { displayValue: format(value), value };
}

const asCount = (value) => value.toLocaleString();
const asFixed2 = (value) => value.toFixed(2);
const asPercent = (value) => value + "%";

function mapAggregatedStatsToFrontend(aggregated) {
  return {
    timePlayed: statOrUnknown(aggregated.totalTime, (value) => Math.round(value / 3600) + "h"),
    kills: statOrUnknown(aggregated.totalKills, asCount),
    deaths: statOrUnknown(aggregated.totalDeaths, asCount),
    kd: statOrUnknown(aggregated.kd, asFixed2),
    wins: statOrUnknown(aggregated.totalWins, asCount),
    matchesPlayed: statOrUnknown(aggregated.totalMatches, asCount),
    roundsPlayed: statOrUnknown(aggregated.totalMatches, asCount),
    mvp: statOrUnknown(aggregated.totalRevives, asCount),
    headshotPct: statOrUnknown(aggregated.totalHeadshots, asCount),
    headshotRate: statOrUnknown(aggregated.headshotRate, asPercent),
    damage: statOrUnknown(aggregated.totalDamage, (value) => Math.round(value).toLocaleString()),
    avgDamage: statOrUnknown(aggregated.avgDamage, asCount),
    wlPercentage: statOrUnknown(aggregated.wlPercentage, asPercent),
    top10Rate: statOrUnknown(aggregated.top10Rate, asPercent),
    killsPerMatch: statOrUnknown(aggregated.killsPerMatch, asFixed2),
    longestKill: statOrUnknown(aggregated.maxKillDistance, (value) => Math.round(value) + "m"),
    longestSurvival: statOrUnknown(aggregated.longestSurvival, formatSurvivalTime),
    assists: statOrUnknown(aggregated.totalAssists, asCount),
    dbnos: statOrUnknown(aggregated.totalDBNOs, asCount),
    top10s: statOrUnknown(aggregated.totalTop10s, asCount),
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
    const rankedAggregated = hasRanked ? aggregateModeStats(normalizedRankedModeStats) : null;
    const combinedAggregated = hasRanked
      ? combineAggregatedStats(normalAggregated, rankedAggregated)
      : normalAggregated;

    data.season = {
      id: seasonData.id,
      label: toSeasonLabel(seasonData.id),
      isCurrentSeason: seasonData.id === currentSeasonId,
      includesRanked: hasRanked,
      rankedInfo,
      stats: mapAggregatedStatsToFrontend(combinedAggregated),
      modes: mapModeGroupsToFrontend(normalModeStats, hasRanked ? normalizedRankedModeStats : null),
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
  normalizeRankedModeStats,
  RANKED_UNREPORTED_FIELDS,
  MODE_STAT_FIELDS,
};
