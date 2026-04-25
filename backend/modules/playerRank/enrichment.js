const MAX_MATCH_HISTORY = 8;
const MATCH_CACHE_DURATION = 6 * 60 * 60 * 1000;

const MAP_LABELS = {
  Baltic_Main: "Erangel",
  Desert_Main: "Miramar",
  DihorOtok_Main: "Vikendi",
  Erangel_Main: "Erangel",
  Heaven_Main: "Haven",
  Kiki_Main: "Deston",
  Neon_Main: "Rondo",
  Range_Main: "Camp Jackal",
  Savage_Main: "Sanhok",
  Summerland_Main: "Karakin",
  Tiger_Main: "Taego",
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatNumber(value) {
  return toInteger(value).toLocaleString();
}

function formatDistance(value) {
  const meters = toNumber(value);
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, toInteger(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatMode(value) {
  const raw = normalizeString(value);
  if (!raw) return "Unknown";

  return raw
    .replace(/^normal-/i, "")
    .split("-")
    .map((part) => part.toUpperCase())
    .join(" ");
}

function formatMapName(value) {
  const raw = normalizeString(value);
  return MAP_LABELS[raw] || raw.replace(/_Main$/i, "") || "Unknown";
}

function readMetricValue(metric, preferredKeys = ["total", "value", "average"]) {
  if (typeof metric === "number") return metric;
  if (!metric || typeof metric !== "object") return 0;

  for (const key of preferredKeys) {
    const parsed = Number(metric[key]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function mapSurvivalMetric(stats, key, label, formatter = formatNumber, preferredKeys) {
  const value = readMetricValue(stats?.[key], preferredKeys);
  return {
    key,
    label,
    value,
    displayValue: formatter(value),
  };
}

function mapSurvivalMastery(payload) {
  const attributes = payload?.data?.attributes;
  if (!attributes) return null;

  const stats = attributes.stats || {};
  const highlights = [
    mapSurvivalMetric(stats, "damageDealt", "Damage dealt"),
    mapSurvivalMetric(stats, "damageTaken", "Damage taken"),
    mapSurvivalMetric(stats, "distanceTotal", "Distance", formatDistance),
    mapSurvivalMetric(stats, "timeSurvived", "Time survived", formatDuration),
    mapSurvivalMetric(stats, "hotDropLandings", "Hot drops"),
    mapSurvivalMetric(stats, "teammatesRevived", "Revives"),
    mapSurvivalMetric(stats, "top10", "Top 10s"),
    mapSurvivalMetric(stats, "throwablesThrown", "Throwables"),
  ].filter((item) => item.value > 0);

  return {
    level: toInteger(attributes.level),
    tier: toInteger(attributes.tier),
    xp: toInteger(attributes.xp),
    totalMatchesPlayed: toInteger(attributes.totalMatchesPlayed),
    latestMatchId: normalizeString(attributes.latestMatchId) || null,
    highlights,
  };
}

function getClanIdFromPlayer(playerRecord) {
  const attributes = playerRecord?.attributes || {};
  const direct =
    normalizeString(attributes.clanId) ||
    normalizeString(attributes.clanID) ||
    normalizeString(attributes.clan_id);
  if (direct) return direct;

  const relationshipClan = playerRecord?.relationships?.clan?.data;
  return normalizeString(relationshipClan?.id) || null;
}

function getRecentMatchIds(playerRecord) {
  const matches = playerRecord?.relationships?.matches?.data;
  if (!Array.isArray(matches)) return [];

  return matches
    .map((item) => normalizeString(item?.id))
    .filter(Boolean);
}

function getParticipantStats(matchPayload, accountId, playerName) {
  const normalizedName = normalizeString(playerName).toLowerCase();
  const included = Array.isArray(matchPayload?.included) ? matchPayload.included : [];

  const participant = included.find((item) => {
    if (item?.type !== "participant") return false;
    const stats = item?.attributes?.stats || {};
    const participantId = normalizeString(stats.playerId);
    const participantName = normalizeString(stats.name).toLowerCase();

    return participantId === accountId || (normalizedName && participantName === normalizedName);
  });

  if (!participant) return { participant: null, roster: null };

  const roster = included.find((item) => {
    if (item?.type !== "roster") return false;
    const participantRefs = item?.relationships?.participants?.data;
    if (!Array.isArray(participantRefs)) return false;
    return participantRefs.some((ref) => ref?.id === participant.id);
  });

  return { participant, roster };
}

function mapMatch(matchPayload, accountId, playerName) {
  const match = matchPayload?.data;
  const attributes = match?.attributes || {};
  const { participant, roster } = getParticipantStats(matchPayload, accountId, playerName);

  if (!match || !participant) return null;

  const stats = participant?.attributes?.stats || {};
  const rosterStats = roster?.attributes?.stats || {};
  const teamRank = toInteger(rosterStats.rank || stats.winPlace, null);
  const damage = toNumber(stats.damageDealt);
  const kills = toInteger(stats.kills);
  const createdAt = normalizeString(attributes.createdAt);

  return {
    id: normalizeString(match.id),
    createdAt: createdAt || null,
    mapName: formatMapName(attributes.mapName),
    rawMapName: normalizeString(attributes.mapName),
    gameMode: normalizeString(attributes.gameMode),
    gameModeLabel: formatMode(attributes.gameMode),
    matchType: normalizeString(attributes.matchType),
    shardId: normalizeString(attributes.shardId),
    duration: toInteger(attributes.duration),
    durationLabel: formatDuration(attributes.duration),
    placement: teamRank,
    placementLabel: teamRank ? `#${teamRank}` : "N/A",
    isWin: teamRank === 1,
    kills,
    damage: Math.round(damage),
    assists: toInteger(stats.assists),
    dbnos: toInteger(stats.DBNOs || stats.dBNOs),
    headshots: toInteger(stats.headshotKills),
    longestKill: Math.round(toNumber(stats.longestKill)),
    survivalTime: toInteger(stats.timeSurvived),
    survivalTimeLabel: formatDuration(stats.timeSurvived),
    heals: toInteger(stats.heals),
    boosts: toInteger(stats.boosts),
    walkDistance: Math.round(toNumber(stats.walkDistance)),
    rideDistance: Math.round(toNumber(stats.rideDistance)),
    deathType: normalizeString(stats.deathType) || null,
  };
}

function buildMatchSummary(items) {
  const total = items.length;
  if (!total) {
    return {
      total: 0,
      wins: 0,
      top10s: 0,
      avgKills: 0,
      avgDamage: 0,
    };
  }

  const wins = items.filter((item) => item.isWin).length;
  const top10s = items.filter((item) => item.placement && item.placement <= 10).length;
  const kills = items.reduce((sum, item) => sum + item.kills, 0);
  const damage = items.reduce((sum, item) => sum + item.damage, 0);

  return {
    total,
    wins,
    top10s,
    avgKills: Number((kills / total).toFixed(2)),
    avgDamage: Math.round(damage / total),
  };
}

function createEmptyMatches() {
  return {
    summary: buildMatchSummary([]),
    items: [],
  };
}

function mapClan(payload, clanId) {
  const attributes = payload?.data?.attributes || {};
  const id = normalizeString(payload?.data?.id) || clanId;
  if (!id) return null;

  return {
    id,
    name: normalizeString(attributes.clanName) || null,
    tag: normalizeString(attributes.clanTag) || null,
    level: toInteger(attributes.clanLevel),
    memberCount: toInteger(attributes.clanMemberCount),
  };
}

function createPlayerEnrichmentService({
  doRequest,
  clanCache,
  masteryCache,
  matchSummaryCache,
  profileCache,
  cacheDuration,
}) {
  async function getPlayerProfile(shard, accountId) {
    const cacheKey = `${shard}:${accountId}`;
    const cached = profileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data;
    }

    const profileUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}`;
    const profile = await doRequest(profileUrl);
    const data = profile?.data || null;

    if (data) {
      profileCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
    }

    return data;
  }

  async function getClan(shard, clanId) {
    if (!clanId) return null;

    const cacheKey = `${shard}:${clanId}`;
    const cached = clanCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data;
    }

    const clanUrl = `https://api.pubg.com/shards/${shard}/clans/${encodeURIComponent(clanId)}`;
    const clanPayload = await doRequest(clanUrl);
    const clan = mapClan(clanPayload, clanId);

    clanCache.set(cacheKey, {
      data: clan,
      timestamp: Date.now(),
    });

    return clan;
  }

  async function getSurvivalMastery(shard, accountId) {
    const cacheKey = `${shard}:${accountId}`;
    const cached = masteryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data;
    }

    const masteryUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}/survival_mastery`;
    const masteryPayload = await doRequest(masteryUrl);
    const mastery = mapSurvivalMastery(masteryPayload);

    masteryCache.set(cacheKey, {
      data: mastery,
      timestamp: Date.now(),
    });

    return mastery;
  }

  async function getMatch(shard, matchId, accountId, playerName) {
    const matchShard = shard === "psn" || shard === "xbox" ? "console" : shard;
    const cacheKey = `${matchShard}:${matchId}:${accountId}`;
    const cached = matchSummaryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < MATCH_CACHE_DURATION) {
      return cached.data;
    }

    const matchUrl = `https://api.pubg.com/shards/${matchShard}/matches/${encodeURIComponent(matchId)}`;
    const matchPayload = await doRequest(matchUrl);
    const match = mapMatch(matchPayload, accountId, playerName);

    if (match) {
      matchSummaryCache.set(cacheKey, {
        data: match,
        timestamp: Date.now(),
      });
    }

    return match;
  }

  async function getRecentMatches(shard, matchIds, accountId, playerName) {
    const limitedIds = (Array.isArray(matchIds) ? matchIds : []).slice(0, MAX_MATCH_HISTORY);
    if (!limitedIds.length) {
      return {
        summary: buildMatchSummary([]),
        items: [],
      };
    }

    const results = await Promise.allSettled(
      limitedIds.map((matchId) => getMatch(shard, matchId, accountId, playerName))
    );

    const items = results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter(Boolean)
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

    return {
      summary: buildMatchSummary(items),
      items,
    };
  }

  async function getProfileExtras({ shard, accountId, playerName, playerRecord }) {
    let profileRecord = playerRecord || null;
    const errors = [];

    if (!profileRecord) {
      try {
        profileRecord = await getPlayerProfile(shard, accountId);
      } catch (e) {
        console.log(`[PUBG] Player profile extras unavailable for ${accountId}: ${e.message}`);
        errors.push(`profile: ${e.message}`);
      }
    }

    const clanId = getClanIdFromPlayer(profileRecord);
    const matchIds = getRecentMatchIds(profileRecord);

    const [clanResult, masteryResult, matchesResult] = await Promise.allSettled([
      getClan(shard, clanId),
      getSurvivalMastery(shard, accountId),
      getRecentMatches(shard, matchIds, accountId, playerName),
    ]);

    if (clanResult.status === "rejected") {
      console.log(`[PUBG] Clan data unavailable for ${playerName}: ${clanResult.reason.message}`);
      errors.push(`clan: ${clanResult.reason.message}`);
    }
    if (masteryResult.status === "rejected") {
      console.log(`[PUBG] Survival mastery unavailable for ${playerName}: ${masteryResult.reason.message}`);
      errors.push(`survival mastery: ${masteryResult.reason.message}`);
    }
    if (matchesResult.status === "rejected") {
      console.log(`[PUBG] Match history unavailable for ${playerName}: ${matchesResult.reason.message}`);
      errors.push(`matches: ${matchesResult.reason.message}`);
    }

    return {
      profile: {
        status: errors.length > 0 ? "partial" : "ok",
        error: errors.length > 0 ? errors.join("; ") : null,
        banType: normalizeString(profileRecord?.attributes?.banType) || null,
        clan: clanResult.status === "fulfilled" ? clanResult.value : null,
        survivalMastery: masteryResult.status === "fulfilled" ? masteryResult.value : null,
      },
      matches:
        matchesResult.status === "fulfilled"
          ? matchesResult.value
          : createEmptyMatches(),
    };
  }

  return {
    getProfileExtras,
  };
}

module.exports = {
  createPlayerEnrichmentService,
  createEmptyMatches,
};
