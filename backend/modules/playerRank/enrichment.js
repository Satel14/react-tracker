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

  if (!participant) return { participant: null, roster: null, teammates: [] };

  const roster = included.find((item) => {
    if (item?.type !== "roster") return false;
    const participantRefs = item?.relationships?.participants?.data;
    if (!Array.isArray(participantRefs)) return false;
    return participantRefs.some((ref) => ref?.id === participant.id);
  });

  const teammates = [];
  const teammateRefs = roster?.relationships?.participants?.data || [];
  teammateRefs.forEach((ref) => {
    if (!ref?.id || ref.id === participant.id) return;
    const tmParticipant = included.find((item) => item?.type === "participant" && item.id === ref.id);
    if (!tmParticipant) return;
    const tmStats = tmParticipant.attributes?.stats || {};
    const tmAccountId = normalizeString(tmStats.playerId);
    if (!tmAccountId || tmAccountId === accountId) return;
    teammates.push({
      accountId: tmAccountId,
      name: normalizeString(tmStats.name) || "Unknown",
      kills: toInteger(tmStats.kills),
      damage: Math.round(toNumber(tmStats.damageDealt)),
      placement: toInteger(tmStats.winPlace),
    });
  });

  return { participant, roster, teammates };
}

function mapMatch(matchPayload, accountId, playerName) {
  const match = matchPayload?.data;
  const attributes = match?.attributes || {};
  const { participant, roster, teammates } = getParticipantStats(matchPayload, accountId, playerName);

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
    teammates: Array.isArray(teammates) ? teammates : [],
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

const WEAPON_LABELS = {
  Item_Weapon_ACE32_C: "ACE32",
  Item_Weapon_AK47_C: "AKM",
  Item_Weapon_AUG_C: "AUG",
  Item_Weapon_AWM_C: "AWM",
  Item_Weapon_Berreta686_C: "S686",
  Item_Weapon_BerylM762_C: "Beryl M762",
  Item_Weapon_BizonPP19_C: "PP-19 Bizon",
  Item_Weapon_BluezoneGrenade_C: "Blue Zone Grenade",
  Item_Weapon_C4_C: "C4",
  Item_Weapon_Crossbow_C: "Crossbow",
  Item_Weapon_Crossbow_1_C: "Crossbow",
  Item_Weapon_DesertEagle_C: "Desert Eagle",
  Item_Weapon_DP12_C: "DBS",
  Item_Weapon_DP28_C: "DP-28",
  Item_Weapon_Dragunov_C: "Dragunov",
  Item_Weapon_FAMASG2_C: "Famas",
  Item_Weapon_FNFal_C: "FN FAL",
  Item_Weapon_G36C_C: "G36C",
  Item_Weapon_Grenade_C: "Frag Grenade",
  Item_Weapon_Groza_C: "Groza",
  Item_Weapon_HK416_C: "M416",
  Item_Weapon_JS9_C: "JS9",
  Item_Weapon_K2_C: "K2",
  Item_Weapon_Kar98k_C: "Kar98k",
  Item_Weapon_L6_C: "Lynx AMR",
  Item_Weapon_M16A4_C: "M16A4",
  Item_Weapon_M1911_C: "M1911",
  Item_Weapon_M249_C: "M249",
  Item_Weapon_M24_C: "M24",
  Item_Weapon_M9_C: "M9",
  Item_Weapon_MG3_C: "MG3",
  Item_Weapon_Mini14_C: "Mini-14",
  Item_Weapon_Mk12_C: "Mk12",
  Item_Weapon_Mk14_C: "Mk14 EBR",
  Item_Weapon_Mk47Mutant_C: "Mk47 Mutant",
  Item_Weapon_Molotov_C: "Molotov",
  Item_Weapon_Mortar_C: "Mortar",
  Item_Weapon_MP5K_C: "MP5K",
  Item_Weapon_MP9_C: "MP9",
  Item_Weapon_Mosin_C: "Mosin",
  Item_Weapon_NagantM1895_C: "R1895",
  Item_Weapon_OriginS12_C: "Origin S12",
  Item_Weapon_P18C_C: "P18C",
  Item_Weapon_P90_C: "P90",
  Item_Weapon_P92_C: "P92",
  Item_Weapon_PanzerFaust100M_C: "PanzerFaust",
  Item_Weapon_QBU88_C: "QBU",
  Item_Weapon_QBZ95_C: "QBZ",
  Item_Weapon_R45_C: "R45",
  "Item_Weapon_SCAR-L_C": "Scar-L",
  Item_Weapon_SKS_C: "SKS",
  Item_Weapon_Saiga12_C: "O12",
  Item_Weapon_SLR_C: "SLR",
  Item_Weapon_TacticalRifle_C: "Mk14 EBR",
  Item_Weapon_Thompson_C: "Tommy Gun",
  Item_Weapon_UMP_C: "UMP45",
  Item_Weapon_UMP9_C: "UMP45",
  Item_Weapon_UZI_C: "Micro Uzi",
  Item_Weapon_VSS_C: "VSS",
  Item_Weapon_Vector_C: "Vector",
  Item_Weapon_Win1894_C: "Win94",
  Item_Weapon_Win94_C: "Win94",
  Item_Weapon_Winchester_C: "S1897",
};

const WEAPON_CATEGORY = {
  Item_Weapon_ACE32_C: "ar",
  Item_Weapon_AK47_C: "ar",
  Item_Weapon_AUG_C: "ar",
  Item_Weapon_BerylM762_C: "ar",
  Item_Weapon_FAMASG2_C: "ar",
  Item_Weapon_G36C_C: "ar",
  Item_Weapon_Groza_C: "ar",
  Item_Weapon_HK416_C: "ar",
  Item_Weapon_K2_C: "ar",
  Item_Weapon_M16A4_C: "ar",
  Item_Weapon_Mk47Mutant_C: "ar",
  Item_Weapon_QBZ95_C: "ar",
  "Item_Weapon_SCAR-L_C": "ar",

  Item_Weapon_Dragunov_C: "dmr",
  Item_Weapon_FNFal_C: "dmr",
  Item_Weapon_Mini14_C: "dmr",
  Item_Weapon_Mk12_C: "dmr",
  Item_Weapon_Mk14_C: "dmr",
  Item_Weapon_QBU88_C: "dmr",
  Item_Weapon_SKS_C: "dmr",
  Item_Weapon_SLR_C: "dmr",
  Item_Weapon_TacticalRifle_C: "dmr",
  Item_Weapon_VSS_C: "dmr",

  Item_Weapon_AWM_C: "sr",
  Item_Weapon_Kar98k_C: "sr",
  Item_Weapon_L6_C: "sr",
  Item_Weapon_M24_C: "sr",
  Item_Weapon_Mosin_C: "sr",
  Item_Weapon_Win1894_C: "sr",
  Item_Weapon_Win94_C: "sr",

  Item_Weapon_BizonPP19_C: "smg",
  Item_Weapon_JS9_C: "smg",
  Item_Weapon_MP5K_C: "smg",
  Item_Weapon_MP9_C: "smg",
  Item_Weapon_P90_C: "smg",
  Item_Weapon_Thompson_C: "smg",
  Item_Weapon_UMP_C: "smg",
  Item_Weapon_UMP9_C: "smg",
  Item_Weapon_UZI_C: "smg",
  Item_Weapon_Vector_C: "smg",

  Item_Weapon_DP28_C: "lmg",
  Item_Weapon_M249_C: "lmg",
  Item_Weapon_MG3_C: "lmg",

  Item_Weapon_Berreta686_C: "shotgun",
  Item_Weapon_DP12_C: "shotgun",
  Item_Weapon_OriginS12_C: "shotgun",
  Item_Weapon_Saiga12_C: "shotgun",
  Item_Weapon_Winchester_C: "shotgun",

  Item_Weapon_DesertEagle_C: "pistol",
  Item_Weapon_M1911_C: "pistol",
  Item_Weapon_M9_C: "pistol",
  Item_Weapon_NagantM1895_C: "pistol",
  Item_Weapon_P18C_C: "pistol",
  Item_Weapon_P92_C: "pistol",
  Item_Weapon_R45_C: "pistol",

  Item_Weapon_Crossbow_C: "special",
  Item_Weapon_Crossbow_1_C: "special",
  Item_Weapon_PanzerFaust100M_C: "special",
  Item_Weapon_Mortar_C: "special",
  Item_Weapon_C4_C: "special",

  Item_Weapon_Grenade_C: "throwable",
  Item_Weapon_Molotov_C: "throwable",
  Item_Weapon_BluezoneGrenade_C: "throwable",
};

const WEAPON_IMAGE_ALIAS = {
  Item_Weapon_UMP9_C: "Item_Weapon_UMP_C",
  Item_Weapon_Win94_C: "Item_Weapon_Win1894_C",
  Item_Weapon_Crossbow_1_C: "Item_Weapon_Crossbow_C",
  Item_Weapon_TacticalRifle_C: "Item_Weapon_Mk14_C",
};

function readableWeaponName(rawName) {
  if (!rawName) return "Unknown";
  if (WEAPON_LABELS[rawName]) return WEAPON_LABELS[rawName];
  return rawName.replace(/^Item_Weapon_/i, "").replace(/_C$/i, "").replace(/_/g, " ");
}

function weaponImageKey(rawName) {
  if (!rawName) return null;
  return WEAPON_IMAGE_ALIAS[rawName] || rawName;
}

function weaponCategory(rawName) {
  return WEAPON_CATEGORY[rawName] || "other";
}

function mapWeaponMastery(payload) {
  const summary = payload?.data?.attributes?.weaponSummaries;
  if (!summary || typeof summary !== "object") return null;

  const items = Object.entries(summary).map(([rawName, weaponData]) => {
    const xpTotal = toInteger(weaponData?.XPTotal);
    const levelCurrent = toInteger(weaponData?.LevelCurrent);
    const tierCurrent = toInteger(weaponData?.TierCurrent);
    const stats = weaponData?.StatsTotal || {};
    const kills = toInteger(stats.Kills);
    const headshots = toInteger(stats.HeadShots);
    const damage = Math.round(toNumber(stats.DamagePlayer));
    const defeats = toInteger(stats.Defeats);
    const groggies = toInteger(stats.Groggies);
    const longestKill = Math.round(toNumber(stats.LongestKill));
    const longestDefeat = Math.round(toNumber(stats.LongestDefeat));
    return {
      raw: rawName,
      imageKey: weaponImageKey(rawName),
      category: weaponCategory(rawName),
      name: readableWeaponName(rawName),
      xp: xpTotal,
      level: levelCurrent,
      tier: tierCurrent,
      kills,
      headshots,
      damage,
      defeats,
      groggies,
      longestKill,
      longestDefeat,
      headshotRate: kills > 0 ? Number(((headshots / kills) * 100).toFixed(1)) : 0,
      avgDamagePerKill: kills > 0 ? Math.round(damage / kills) : 0,
    };
  });

  const filtered = items.filter((weapon) => {
    if (weapon.kills > 0 || weapon.groggies > 0 || weapon.damage > 0) return true;
    if (["throwable", "special"].includes(weapon.category) && weapon.xp > 0) return true;
    return false;
  });
  filtered.sort((a, b) => b.kills - a.kills || b.xp - a.xp);
  return filtered;
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

  async function getWeaponMastery(shard, accountId) {
    const cacheKey = `weapon:${shard}:${accountId}`;
    const cached = masteryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data;
    }

    const url = `https://api.pubg.com/shards/${shard}/players/${accountId}/weapon_mastery`;
    const payload = await doRequest(url);
    const weapons = mapWeaponMastery(payload);

    masteryCache.set(cacheKey, {
      data: weapons,
      timestamp: Date.now(),
    });

    return weapons;
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

    const [clanResult, masteryResult, weaponResult, matchesResult] = await Promise.allSettled([
      getClan(shard, clanId),
      getSurvivalMastery(shard, accountId),
      getWeaponMastery(shard, accountId),
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
    if (weaponResult.status === "rejected") {
      console.log(`[PUBG] Weapon mastery unavailable for ${playerName}: ${weaponResult.reason.message}`);
      errors.push(`weapon mastery: ${weaponResult.reason.message}`);
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
        weaponMastery: weaponResult.status === "fulfilled" ? weaponResult.value : null,
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
