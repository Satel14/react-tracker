const {
  readableWeaponName,
  weaponImageKey,
  weaponCategory,
} = require("../weaponMeta");
const { isAccountIdentifier } = require("../playerIdentity");
const { fetchTelemetryHead, findTelemetryUrl } = require("../pubgTelemetry");
const { readRegionFromTelemetryHead } = require("../matchContext");
const { buildPartyOverlap } = require("./party");

const MAX_MATCH_HISTORY = 8;
const MATCH_CACHE_DURATION = 6 * 60 * 60 * 1000;
// PUBG takes ten account ids per players?filter[playerIds] request. Eight squad
// matches can surface more mates than that, so candidates are ranked by how
// often they appear and the tail beyond two requests is dropped rather than
// bought at one request each.
const PARTY_BATCH_SIZE = 10;
const PARTY_MAX_BATCHES = 2;
// A match's region never changes, so these entries never go stale -- they only
// need a ceiling so a long-lived process cannot grow one match at a time.
const MATCH_REGION_CACHE_LIMIT = 500;

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

// Only the header numbers are real. Every metric under `stats` reads 0 on every
// account -- verified 2026-09-09 against profiles with 6 605 and 14 838 matches,
// where the sole moving value was timeSurvived.lastMatchValue -- so the
// highlights list this used to build was always empty by the time it shipped.
function mapSurvivalMastery(payload) {
  const attributes = payload?.data?.attributes;
  if (!attributes) return null;

  return {
    level: toInteger(attributes.level),
    tier: toInteger(attributes.tier),
    xp: toInteger(attributes.xp),
    totalMatchesPlayed: toInteger(attributes.totalMatchesPlayed),
    // survival_mastery calls it lastMatchId. latestMatchId is weapon_mastery's
    // name for the same thing, and reading that here left this null always.
    lastMatchId: normalizeString(attributes.lastMatchId) || null,
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

function mapWeaponMastery(payload) {
  const summary = payload?.data?.attributes?.weaponSummaries;
  if (!summary || typeof summary !== "object") return null;

  const items = Object.entries(summary).map(([rawName, weaponData]) => {
    const xpTotal = toInteger(weaponData?.XPTotal);
    const levelCurrent = toInteger(weaponData?.LevelCurrent);
    const tierCurrent = toInteger(weaponData?.TierCurrent);
    // StatsTotal froze at patch 18.2 (2022); since then normal and ranked stats
    // accumulate separately in OfficialStatsTotal / CompetitiveStatsTotal, so
    // career totals are the sum of all three disjoint blocks.
    const legacy = weaponData?.StatsTotal || {};
    const official = weaponData?.OfficialStatsTotal || {};
    const competitive = weaponData?.CompetitiveStatsTotal || {};
    const blocks = [legacy, official, competitive];
    const sumStat = (key) => blocks.reduce((acc, block) => acc + toNumber(block?.[key]), 0);

    const kills = Math.round(sumStat("Kills"));
    const headshots = Math.round(sumStat("HeadShots"));
    const damage = Math.round(sumStat("DamagePlayer"));
    const defeats = Math.round(sumStat("Defeats"));
    const groggies = Math.round(sumStat("Groggies"));
    const longestKill = Math.round(
      Math.max(
        toNumber(legacy.LongestDefeat),
        toNumber(official.LongestKill),
        toNumber(competitive.LongestKill)
      )
    );
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
  matchRegionCache = new Map(),
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
        // Kept beside the mapped match rather than inside it: the region leg
        // needs this URL later, and the client has no use for it.
        telemetryUrl: findTelemetryUrl(matchPayload),
        timestamp: Date.now(),
      });
    }

    return match;
  }

  function cachedTelemetryUrl(shard, matchId, accountId) {
    const matchShard = shard === "psn" || shard === "xbox" ? "console" : shard;
    const cached = matchSummaryCache.get(`${matchShard}:${matchId}:${accountId}`);
    if (!cached || Date.now() - cached.timestamp >= MATCH_CACHE_DURATION) return null;
    return cached.telemetryUrl || null;
  }

  async function getRecentMatches(shard, matchIds, accountId, playerName) {
    const ids = Array.isArray(matchIds) ? matchIds : [];
    const limitedIds = ids.slice(0, MAX_MATCH_HISTORY);
    // The player record lists every match PUBG still holds for the account, so a
    // list that fits in one page is the entire history. Both fields are read by
    // rankPointHistory: `complete` rules out an unseen older match, `fetchedAt`
    // says how much of PUBG's ingestion lag this list can already reflect.
    const complete = ids.length <= MAX_MATCH_HISTORY;
    if (!limitedIds.length) {
      return {
        summary: buildMatchSummary([]),
        items: [],
        fetchedAt: Date.now(),
        complete,
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
      fetchedAt: Date.now(),
      complete,
    };
  }

  // Candidates ranked by how many of the fetched matches they shared a roster
  // in: that is the only ordering available before the histories are read, and
  // it puts the likeliest party mates inside the request budget.
  function partyCandidates(matchItems) {
    const seen = new Map();
    (Array.isArray(matchItems) ? matchItems : []).forEach((match) => {
      (Array.isArray(match?.teammates) ? match.teammates : []).forEach((mate) => {
        const accountId = normalizeString(mate?.accountId);
        if (!accountId || !isAccountIdentifier(accountId)) return;
        const entry = seen.get(accountId) || { accountId, name: mate.name || null, count: 0 };
        entry.count += 1;
        if (mate.name && mate.name !== "Unknown") entry.name = mate.name;
        seen.set(accountId, entry);
      });
    });

    return [...seen.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, PARTY_BATCH_SIZE * PARTY_MAX_BATCHES);
  }

  async function fetchMateHistories(shard, candidates) {
    const byAccount = new Map();

    for (let at = 0; at < candidates.length; at += PARTY_BATCH_SIZE) {
      const chunk = candidates.slice(at, at + PARTY_BATCH_SIZE);
      const url = `https://api.pubg.com/shards/${shard}/players?filter[playerIds]=${chunk
        .map((candidate) => encodeURIComponent(candidate.accountId))
        .join(",")}`;
      const payload = await doRequest(url);
      (Array.isArray(payload?.data) ? payload.data : []).forEach((record) => {
        byAccount.set(record.id, {
          // The batch knows the name the account carries today; the roster only
          // knows the one it wore when the match was played, and a renamed
          // player cannot be looked up under the old one.
          name: normalizeString(record?.attributes?.name) || null,
          matchIds: getRecentMatchIds(record),
        });
      });
    }

    return candidates.map((candidate) => {
      const fetched = byAccount.get(candidate.accountId);
      return {
        accountId: candidate.accountId,
        name: fetched?.name || candidate.name,
        matchIds: fetched?.matchIds || [],
      };
    });
  }

  function rememberRegion(matchId, region) {
    matchRegionCache.set(matchId, region);
    while (matchRegionCache.size > MATCH_REGION_CACHE_LIMIT) {
      const oldest = matchRegionCache.keys().next().value;
      if (oldest === undefined) break;
      matchRegionCache.delete(oldest);
    }
  }

  // The server region a match ran on. It exists nowhere in the match record --
  // only inside the telemetry file, in LogMatchDefinition.MatchId -- so each
  // match costs one ranged read of a few kilobytes off the CDN. That host is not
  // the rate-limited API, and a region never changes once the match is played,
  // hence the long-lived cache keyed on the match alone.
  async function getMatchRegions({ shard, accountId, playerName, profileRecord }) {
    const matchIds = getRecentMatchIds(profileRecord).slice(0, MAX_MATCH_HISTORY);
    if (!matchIds.length) return {};

    // Warms matchSummaryCache when the rank flow has not already: that is where
    // the telemetry URLs come from.
    await getRecentMatches(shard, matchIds, accountId, playerName);

    const results = await Promise.allSettled(matchIds.map(async (matchId) => {
      const known = matchRegionCache.get(matchId);
      if (known) return [matchId, known];

      const url = cachedTelemetryUrl(shard, matchId, accountId);
      if (!url) return [matchId, null];

      const region = readRegionFromTelemetryHead(await fetchTelemetryHead(url));
      if (region) rememberRegion(matchId, region);
      return [matchId, region];
    }));

    const regions = {};
    results.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const [matchId, region] = result.value;
      if (region) regions[matchId] = region;
    });

    return regions;
  }

  // How much of a squad-mate's own recent history they spent in this player's
  // matches. PUBG publishes no party id, so this overlap is the signal.
  async function getPartyOverlap({ shard, accountId, playerName, profileRecord }) {
    const focalMatchIds = getRecentMatchIds(profileRecord);
    if (!focalMatchIds.length) return [];

    const matches = await getRecentMatches(shard, focalMatchIds, accountId, playerName);
    const candidates = partyCandidates(matches.items);
    if (!candidates.length) return [];

    const mates = await fetchMateHistories(shard, candidates);
    return buildPartyOverlap({ focalMatchIds, mates });
  }

  async function getMatchExtras({ shard, accountId, playerName, playerRecord }) {
    let profileRecord = playerRecord || null;
    let profileError = null;

    if (!profileRecord) {
      try {
        profileRecord = await getPlayerProfile(shard, accountId);
      } catch (e) {
        console.log(`[PUBG] Player profile unavailable for ${accountId}: ${e.message}`);
        profileError = `profile: ${e.message}`;
      }
    }

    const matchIds = getRecentMatchIds(profileRecord);
    let matches = createEmptyMatches();
    try {
      matches = await getRecentMatches(shard, matchIds, accountId, playerName);
    } catch (e) {
      console.log(`[PUBG] Match history unavailable for ${playerName}: ${e.message}`);
    }

    return {
      profile: {
        status: "deferred",
        error: profileError,
        banType: normalizeString(profileRecord?.attributes?.banType) || null,
        clan: null,
        survivalMastery: null,
        weaponMastery: null,
      },
      matches,
    };
  }

  async function getMasteryExtras({ shard, accountId, playerName }) {
    let profileRecord = null;
    const errors = [];

    try {
      profileRecord = await getPlayerProfile(shard, accountId);
    } catch (e) {
      console.log(`[PUBG] Player profile unavailable for ${accountId}: ${e.message}`);
      errors.push(`profile: ${e.message}`);
    }

    const clanId = getClanIdFromPlayer(profileRecord);

    const [clanResult, masteryResult, weaponResult, partyResult, regionResult] = await Promise.allSettled([
      getClan(shard, clanId),
      getSurvivalMastery(shard, accountId),
      getWeaponMastery(shard, accountId),
      getPartyOverlap({ shard, accountId, playerName, profileRecord }),
      getMatchRegions({ shard, accountId, playerName, profileRecord }),
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
    if (partyResult.status === "rejected") {
      console.log(`[PUBG] Party overlap unavailable for ${playerName}: ${partyResult.reason.message}`);
      errors.push(`party: ${partyResult.reason.message}`);
    }

    return {
      status: errors.length > 0 ? "partial" : "ok",
      error: errors.length > 0 ? errors.join("; ") : null,
      banType: normalizeString(profileRecord?.attributes?.banType) || null,
      clan: clanResult.status === "fulfilled" ? clanResult.value : null,
      survivalMastery: masteryResult.status === "fulfilled" ? masteryResult.value : null,
      weaponMastery: weaponResult.status === "fulfilled" ? weaponResult.value : null,
      // null rather than [] when the leg failed, so the page can tell "unknown"
      // from "measured, and there is no party".
      party: partyResult.status === "fulfilled" ? partyResult.value : null,
      // Cosmetic, and read off a host that can be down without anything else
      // being wrong, so a failure here is an empty map rather than a partial
      // payload.
      matchRegions: regionResult.status === "fulfilled" ? regionResult.value : {},
    };
  }

  return {
    getPlayerProfile,
    getMatchExtras,
    getMasteryExtras,
  };
}

module.exports = {
  createPlayerEnrichmentService,
  createEmptyMatches,
  mapWeaponMastery,
};
