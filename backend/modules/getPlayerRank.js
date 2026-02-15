const PUBG_API_KEY = process.env.PUBG_API_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY || process.env.STEAM_WEB_API_KEY || "";

const playerCache = new Map();
const playerNameCache = new Map();
const statsCache = new Map();
const lifetimeStatsCache = new Map();
const seasonCatalogCache = new Map();
const steamAvatarCache = new Map();
const inFlightRankRequests = new Map();
const stalePlayerDataCache = new Map();

const CACHE_DURATION = 10 * 60 * 1000;
const CURRENT_SEASON_CACHE_DURATION = 60 * 60 * 1000;
const STEAM_CACHE_DURATION = 6 * 60 * 60 * 1000;
const STALE_PLAYER_DATA_CACHE_DURATION = 30 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 20 * 1000;

let rateLimitedUntil = 0;

function setRateLimited() {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}

function getStalePlayerData(cacheKey) {
  const entry = stalePlayerDataCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > STALE_PLAYER_DATA_CACHE_DURATION) {
    stalePlayerDataCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setStalePlayerData(cacheKey, data) {
  stalePlayerDataCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
}

async function doRequest(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PUBG_API_KEY}`,
      Accept: "application/vnd.api+json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("Player not found");
    if (response.status === 401) throw new Error("API Key Invalid");
    if (response.status === 429) {
      setRateLimited();
      throw new Error("Rate Limit Reached");
    }
    throw new Error(`PUBG API Error: ${response.statusText}`);
  }

  return response.json();
}

function resolveShard(platform) {
  if (platform === "xbl" || platform === "xbox") return "xbox";
  if (platform === "psn") return "psn";
  return "steam";
}

function isAccountIdentifier(value) {
  return typeof value === "string" && /^account\./i.test(value.trim());
}

function getPlayerNameCacheKey(shard, accountId) {
  return `${shard}:${accountId}`;
}

function getCachedPlayerName(shard, accountId) {
  if (!accountId) return null;
  const key = getPlayerNameCacheKey(shard, accountId);
  const cached = playerNameCache.get(key);
  if (typeof cached !== "string") return null;
  const normalized = cached.trim();
  if (!normalized || isAccountIdentifier(normalized)) return null;
  return normalized;
}

function setCachedPlayerName(shard, accountId, playerName) {
  if (!accountId || typeof playerName !== "string") return;
  const normalized = playerName.trim();
  if (!normalized || isAccountIdentifier(normalized)) return;
  const key = getPlayerNameCacheKey(shard, accountId);
  playerNameCache.set(key, normalized);
}

async function fetchPlayerNameByAccountId(shard, accountId) {
  if (!accountId || !String(accountId).startsWith("account.")) return null;
  if (isRateLimited()) return null;

  const playerProfileUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}`;
  const playerData = await doRequest(playerProfileUrl);
  const name = playerData?.data?.attributes?.name;
  if (typeof name !== "string" || !name.trim()) return null;
  return name.trim();
}

async function ensurePlayerName(shard, accountId, fallbackName = "") {
  const cached = getCachedPlayerName(shard, accountId);
  if (cached) return cached;

  try {
    const resolved = await fetchPlayerNameByAccountId(shard, accountId);
    if (resolved) {
      setCachedPlayerName(shard, accountId, resolved);
      return resolved;
    }
  } catch (e) {
    console.log(`[PUBG] Player profile name unavailable for ${accountId}: ${e.message}`);
  }

  return typeof fallbackName === "string" && fallbackName.trim() ? fallbackName.trim() : accountId;
}

function normalizeSteamCandidate(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const profileMatch = raw.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return profileMatch[1];

  const idMatch = raw.match(/steamcommunity\.com\/id\/([^\/\?\#]+)/i);
  if (idMatch) return idMatch[1];

  return raw;
}

function getSafeInitials(name) {
  if (typeof name !== "string" || !name.trim()) return "PU";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function buildFallbackAvatarDataUri(name) {
  const initials = getSafeInitials(name);
  const safeInitials = initials.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "PU";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#172236"/><stop offset="100%" stop-color="#0c141f"/></linearGradient></defs><rect width="256" height="256" rx="32" fill="url(#g)"/><circle cx="128" cy="128" r="94" fill="none" stroke="#78f7a8" stroke-opacity="0.35" stroke-width="4"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="86" font-weight="700" fill="#ffffff">${safeInitials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function getSteamAvatarByCandidate(candidate) {
  if (!STEAM_API_KEY) return null;
  const normalized = normalizeSteamCandidate(candidate);
  if (!normalized) return null;

  const cached = steamAvatarCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < STEAM_CACHE_DURATION) {
    return cached.data;
  }

  let steamId64 = null;
  if (/^\d{17}$/.test(normalized)) {
    steamId64 = normalized;
  } else {
    const resolveUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_API_KEY}&vanityurl=${encodeURIComponent(
      normalized
    )}`;
    const resolveResponse = await fetch(resolveUrl);
    if (resolveResponse.ok) {
      const resolveData = await resolveResponse.json();
      if (String(resolveData?.response?.success) === "1") {
        steamId64 = resolveData.response.steamid;
      }
    }
  }

  if (!steamId64) {
    steamAvatarCache.set(normalized, { data: null, timestamp: Date.now() });
    return null;
  }

  const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId64}`;
  const summaryResponse = await fetch(summaryUrl);
  if (!summaryResponse.ok) {
    steamAvatarCache.set(normalized, { data: null, timestamp: Date.now() });
    return null;
  }

  const summaryData = await summaryResponse.json();
  const player = summaryData?.response?.players?.[0];
  const avatarUrl = player?.avatarfull || player?.avatarmedium || player?.avatar || null;
  const result = avatarUrl
    ? {
        avatarUrl,
        steamId64,
      }
    : null;

  steamAvatarCache.set(normalized, { data: result, timestamp: Date.now() });
  return result;
}

async function getBestEffortSteamAvatar(gameid, playerName) {
  if (!STEAM_API_KEY) return null;

  const candidates = [gameid, playerName];
  for (const candidate of candidates) {
    try {
      const profile = await getSteamAvatarByCandidate(candidate);
      if (profile?.avatarUrl) {
        return profile.avatarUrl;
      }
    } catch (e) {
      console.log(`[STEAM] Avatar resolve failed for ${candidate}: ${e.message}`);
    }
  }

  return null;
}

function formatSurvivalTime(seconds) {
  const totalSeconds = Number(seconds) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTierName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeSubTier(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return String(Math.floor(asNumber));
  return raw;
}

function tierTitleCase(tier) {
  const normalized = normalizeTierName(tier);
  if (!normalized) return "Unranked";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toTierScore(tier, subTier) {
  const order = {
    unranked: 0,
    bronze: 10,
    silver: 20,
    gold: 30,
    platinum: 40,
    diamond: 50,
    master: 60,
    grandmaster: 70,
    survivor: 75,
    top500: 80,
  };

  const normalizedTier = normalizeTierName(tier) || "unranked";
  const base = order[normalizedTier] || 0;
  const sub = toNumberOrNull(subTier);
  if (!sub) return base;

  // Higher division should produce slightly higher score (I > II > III ...)
  return base + Math.max(0, 10 - sub);
}

const LOCAL_PUBG_RANK_ICON_URLS = {
  unranked: "/images/ranks/opgg/unranked.png",
  bronze: "/images/ranks/opgg/bronze-1.png",
  silver: "/images/ranks/opgg/silver-1.png",
  gold: "/images/ranks/opgg/gold-1.png",
  platinum: "/images/ranks/opgg/platinum-1.png",
  diamond: "/images/ranks/opgg/diamond-1.png",
  elite: "/images/ranks/opgg/diamond-1.png",
  master: "/images/ranks/opgg/master-1.png",
  grandmaster: "/images/ranks/opgg/survivor-1.png",
  survivor: "/images/ranks/opgg/survivor-1.png",
  top500: "/images/ranks/opgg/survivor-1.png",
};

function toSubTierNumber(value) {
  const normalized = normalizeSubTier(value);
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.max(1, Math.min(5, Math.floor(numeric)));
  }

  const roman = normalized.toUpperCase();
  const romanMap = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
  };

  return romanMap[roman] || null;
}

function buildLocalOpggCompetitiveRankIconPath(tier, subTier) {
  const normalizedTier = normalizeTierName(tier) || "unranked";
  const withDivision = new Set(["bronze", "silver", "gold", "platinum", "diamond", "survivor"]);

  if (withDivision.has(normalizedTier)) {
    const subTierNumber = toSubTierNumber(subTier) || 1;
    return `/images/ranks/opgg/${normalizedTier}-${subTierNumber}.png`;
  }

  if (normalizedTier === "master") {
    return "/images/ranks/opgg/master-1.png";
  }

  if (normalizedTier === "grandmaster") {
    return LOCAL_PUBG_RANK_ICON_URLS.grandmaster;
  }

  if (normalizedTier === "top500") {
    return LOCAL_PUBG_RANK_ICON_URLS.top500;
  }

  return "/images/ranks/opgg/unranked.png";
}

function buildLocalRankIconUrl(tier) {
  const normalizedTier = normalizeTierName(tier) || "unranked";
  return LOCAL_PUBG_RANK_ICON_URLS[normalizedTier] || LOCAL_PUBG_RANK_ICON_URLS.unranked;
}

function buildRankBadgeData(tier, subTier) {
  const primary = buildLocalOpggCompetitiveRankIconPath(tier, subTier);
  const fallback = buildLocalRankIconUrl(tier);
  return {
    iconUrl: primary || fallback,
    iconFallbackUrl: fallback,
  };
}

function extractTierInfo(rawTier = null) {
  if (!rawTier || typeof rawTier !== "object") return null;
  const tier = normalizeTierName(rawTier.tier);
  const subTier = normalizeSubTier(rawTier.subTier);
  if (!tier) return null;
  return {
    tier,
    subTier,
    label: subTier ? `${tierTitleCase(tier)} ${subTier}` : tierTitleCase(tier),
  };
}

function extractRankedInfo(rankedModeStats = {}) {
  const entries = Object.entries(rankedModeStats || {});
  if (!entries.length) return null;

  const modeSummaries = [];
  let best = null;

  entries.forEach(([mode, stats]) => {
    const currentTier = extractTierInfo(stats?.currentTier);
    const bestTier = extractTierInfo(stats?.bestTier);
    const chosenTier = currentTier || bestTier;
    if (!chosenTier) return;

    const rankPoints = toNumberOrNull(stats?.currentRankPoint);
    const bestRankPoints = toNumberOrNull(stats?.bestRankPoint);
    const score = toTierScore(chosenTier.tier, chosenTier.subTier) + (rankPoints || 0) / 10000;
    const rankBadge = buildRankBadgeData(chosenTier.tier, chosenTier.subTier);

    const summary = {
      mode,
      tier: chosenTier.tier,
      subTier: chosenTier.subTier,
      label: chosenTier.label,
      currentRankPoint: rankPoints,
      bestRankPoint: bestRankPoints,
      iconUrl: rankBadge.iconUrl,
      iconFallbackUrl: rankBadge.iconFallbackUrl,
      score,
    };

    modeSummaries.push(summary);
    if (!best || summary.score > best.score) {
      best = summary;
    }
  });

  if (!best) return null;

  return {
    tier: best.tier,
    subTier: best.subTier,
    label: best.label,
    mode: best.mode,
    currentRankPoint: best.currentRankPoint,
    bestRankPoint: best.bestRankPoint,
    iconUrl: best.iconUrl,
    byMode: modeSummaries
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...rest }) => rest),
  };
}

function parseSeasonNumber(seasonId) {
  if (typeof seasonId !== "string") return null;
  const match = seasonId.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function toSeasonLabel(seasonId) {
  const number = parseSeasonNumber(seasonId);
  return Number.isFinite(number) ? `Season #${number}` : "Current Season";
}

function normalizeSeasonId(seasonId) {
  if (typeof seasonId !== "string") return null;
  const normalized = seasonId.trim();
  return normalized ? normalized : null;
}

async function getSeasonCatalog(shard) {
  const cached = seasonCatalogCache.get(shard);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const seasonsUrl = `https://api.pubg.com/shards/${shard}/seasons`;
  const seasonsData = await doRequest(seasonsUrl);

  const mappedSeasons = (seasonsData.data || [])
    .filter((season) => !(season.attributes && season.attributes.isOffseason))
    .map((season) => {
      const seasonNumber = parseSeasonNumber(season.id);
      return {
        id: season.id,
        label: toSeasonLabel(season.id),
        seasonNumber,
        isCurrentSeason: Boolean(season.attributes && season.attributes.isCurrentSeason),
      };
    });

  const dedupBySeason = new Map();
  mappedSeasons.forEach((season) => {
    const key = Number.isFinite(season.seasonNumber) ? `num:${season.seasonNumber}` : `id:${season.id}`;
    const existing = dedupBySeason.get(key);

    if (!existing) {
      dedupBySeason.set(key, season);
      return;
    }

    if (season.isCurrentSeason && !existing.isCurrentSeason) {
      dedupBySeason.set(key, season);
      return;
    }

    const seasonLooksCanonical = /-\d+$/.test(season.id);
    const existingLooksCanonical = /-\d+$/.test(existing.id);
    if (seasonLooksCanonical && !existingLooksCanonical) {
      dedupBySeason.set(key, season);
    }
  });

  const seasons = Array.from(dedupBySeason.values()).sort((a, b) => {
      if (Number.isFinite(a.seasonNumber) && Number.isFinite(b.seasonNumber)) {
        return b.seasonNumber - a.seasonNumber;
      }
      if (Number.isFinite(a.seasonNumber)) return -1;
      if (Number.isFinite(b.seasonNumber)) return 1;
      return String(b.id).localeCompare(String(a.id));
    });

  const currentSeason = seasons.find((season) => season.isCurrentSeason) || seasons[0] || null;
  const data = {
    seasons,
    currentSeasonId: currentSeason ? currentSeason.id : null,
  };

  seasonCatalogCache.set(shard, {
    data,
    expiresAt: Date.now() + CURRENT_SEASON_CACHE_DURATION,
  });

  return data;
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

module.exports.parsePlayerRank = async (platform, gameid, options = {}) => {
  const shard = resolveShard(platform);
  const requestedSeasonId = normalizeSeasonId(options?.seasonId);
  const requestedPlayerId = String(gameid || "").trim();
  const requestKey = `${shard}:${requestedPlayerId}:${requestedSeasonId || "current"}`;
  const staleByRequest = getStalePlayerData(requestKey);

  if (isRateLimited() && staleByRequest) {
    console.log(`[PUBG] Rate-limit cooldown, serving stale cache for ${requestedPlayerId}`);
    return staleByRequest;
  }

  const inFlight = inFlightRankRequests.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const run = (async () => {
    try {
      const playerCacheKey = `${shard}:${requestedPlayerId}`;
      let accountId = playerCache.get(playerCacheKey);
      let playerName = requestedPlayerId;

      if (!accountId) {
        if (isAccountIdentifier(requestedPlayerId)) {
          accountId = requestedPlayerId;
          playerName = await ensurePlayerName(shard, accountId, requestedPlayerId);
        } else {
          if (isRateLimited() && staleByRequest) {
            console.log(`[PUBG] Skipping resolve due to cooldown, stale cache for ${requestedPlayerId}`);
            return staleByRequest;
          }

          console.log(`[PUBG] Resolving player: ${requestedPlayerId}`);
          const searchUrl = `https://api.pubg.com/shards/${shard}/players?filter[playerNames]=${encodeURIComponent(requestedPlayerId)}`;
          const searchData = await doRequest(searchUrl);

          if (!searchData.data || searchData.data.length === 0) {
            throw new Error("Player not found");
          }

          accountId = searchData.data[0].id;
          playerName = searchData.data[0].attributes.name;
          playerCache.set(playerCacheKey, accountId);
          setCachedPlayerName(shard, accountId, playerName);
        }
      } else {
        console.log(`[PUBG] Cache hit for player ID: ${requestedPlayerId} -> ${accountId}`);
        if (isAccountIdentifier(requestedPlayerId) || requestedPlayerId === accountId) {
          playerName = await ensurePlayerName(
            shard,
            accountId,
            getCachedPlayerName(shard, accountId) || requestedPlayerId
          );
        } else {
          playerName = getCachedPlayerName(shard, accountId) || requestedPlayerId;
        }
      }

      if (isAccountIdentifier(playerName) && !isAccountIdentifier(requestedPlayerId)) {
        playerName = requestedPlayerId;
      }

      if (isAccountIdentifier(playerName)) {
        const resolvedName = await ensurePlayerName(shard, accountId, playerName);
        if (resolvedName && !isAccountIdentifier(resolvedName)) {
          playerName = resolvedName;
        }
      }

      let seasonCatalog = null;
      try {
        seasonCatalog = await getSeasonCatalog(shard);
      } catch (seasonCatalogError) {
        const cachedCatalog = seasonCatalogCache.get(shard);
        if (cachedCatalog?.data) {
          seasonCatalog = cachedCatalog.data;
          console.log(`[PUBG] Using cached season catalog for ${shard}: ${seasonCatalogError.message}`);
        } else {
          console.log(`[PUBG] Season catalog unavailable for ${shard}: ${seasonCatalogError.message}`);
        }
      }

      const seasonIds = new Set((seasonCatalog?.seasons || []).map((season) => season.id));
      const targetSeasonId =
        requestedSeasonId && (seasonIds.size === 0 || seasonIds.has(requestedSeasonId))
          ? requestedSeasonId
          : seasonCatalog?.currentSeasonId || requestedSeasonId || null;

      const statsCacheKey = `${shard}:${accountId}:${targetSeasonId || "no-season"}`;
      const cachedStats = statsCache.get(statsCacheKey);
      if (cachedStats && Date.now() - cachedStats.timestamp < CACHE_DURATION) {
        let cachedPayload = cachedStats.data;
        let shouldRewriteCachedPayload = false;
        const cachedHandle = cachedStats?.data?.data?.platformInfo?.platformUserHandle;
        if (typeof cachedHandle === "string" && cachedHandle.trim() && !isAccountIdentifier(cachedHandle.trim())) {
          playerName = cachedHandle.trim();
          setCachedPlayerName(shard, accountId, playerName);
        } else if (!isAccountIdentifier(requestedPlayerId)) {
          playerName = requestedPlayerId;
          cachedPayload = {
            ...cachedPayload,
            data: {
              ...(cachedPayload?.data || {}),
              platformInfo: {
              ...(cachedPayload?.data?.platformInfo || {}),
                platformUserHandle: playerName,
              },
            },
          };
          shouldRewriteCachedPayload = true;
        }

        const cachedRankedInfo = cachedPayload?.data?.season?.rankedInfo;
        if (cachedRankedInfo?.tier) {
          const expectedBadge = buildRankBadgeData(cachedRankedInfo.tier, cachedRankedInfo.subTier);
          const expectedIconUrl = expectedBadge.iconUrl;
          const expectedFallbackUrl = expectedBadge.iconFallbackUrl;
          const currentIconUrl = cachedRankedInfo.iconUrl;
          const currentFallbackUrl = cachedRankedInfo.iconFallbackUrl;

          if (
            typeof expectedIconUrl === "string" &&
            (expectedIconUrl !== currentIconUrl || expectedFallbackUrl !== currentFallbackUrl)
          ) {
            const byMode = Array.isArray(cachedRankedInfo.byMode)
              ? cachedRankedInfo.byMode.map((entry) => ({
                  ...entry,
                  iconUrl: buildRankBadgeData(entry?.tier, entry?.subTier).iconUrl,
                  iconFallbackUrl: buildRankBadgeData(entry?.tier, entry?.subTier).iconFallbackUrl,
                }))
              : cachedRankedInfo.byMode;

            cachedPayload = {
              ...cachedPayload,
              data: {
                ...(cachedPayload?.data || {}),
                season: {
                  ...(cachedPayload?.data?.season || {}),
                  rankedInfo: {
                    ...cachedRankedInfo,
                    iconUrl: expectedIconUrl,
                    iconFallbackUrl: expectedFallbackUrl,
                    byMode,
                  },
                },
              },
            };

            shouldRewriteCachedPayload = true;
          }
        }

        if (shouldRewriteCachedPayload) {
          statsCache.set(statsCacheKey, {
            ...cachedStats,
            data: cachedPayload,
          });
          setStalePlayerData(requestKey, cachedPayload);
        }
        console.log(`[PUBG] Serving cached stats for ${playerName} (${targetSeasonId || "no-season"})`);
        return cachedPayload;
      }

      const lifetimeCacheKey = `${shard}:${accountId}:lifetime`;
      let lifetimeAttributes = null;
      const cachedLifetime = lifetimeStatsCache.get(lifetimeCacheKey);
      if (cachedLifetime && Date.now() - cachedLifetime.timestamp < CACHE_DURATION) {
        lifetimeAttributes = cachedLifetime.data;
      } else {
        console.log(`[PUBG] Fetching fresh stats for ${playerName}`);
        const lifetimeUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}/seasons/lifetime`;
        const lifetimeData = await doRequest(lifetimeUrl);

        if (!lifetimeData.data || !lifetimeData.data.attributes) {
          throw new Error("No stats found for this player");
        }

        lifetimeAttributes = lifetimeData.data.attributes;
        lifetimeStatsCache.set(lifetimeCacheKey, {
          data: lifetimeAttributes,
          timestamp: Date.now(),
        });
      }

      let seasonData = null;
      let rankedSeasonData = null;
      if (targetSeasonId) {
        try {
          const seasonStatsUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}/seasons/${targetSeasonId}`;
          const seasonStatsData = await doRequest(seasonStatsUrl);

          if (seasonStatsData && seasonStatsData.data && seasonStatsData.data.attributes) {
            seasonData = {
              id: targetSeasonId,
              attributes: seasonStatsData.data.attributes,
            };
          }

          try {
            const rankedSeasonStatsUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}/seasons/${targetSeasonId}/ranked`;
            const rankedSeasonStatsData = await doRequest(rankedSeasonStatsUrl);
            if (
              rankedSeasonStatsData &&
              rankedSeasonStatsData.data &&
              rankedSeasonStatsData.data.attributes &&
              rankedSeasonStatsData.data.attributes.rankedGameModeStats
            ) {
              rankedSeasonData = {
                id: targetSeasonId,
                attributes: rankedSeasonStatsData.data.attributes,
              };
            }
          } catch (rankedSeasonError) {
            console.log(`[PUBG] Ranked season stats unavailable for ${playerName}: ${rankedSeasonError.message}`);
          }
        } catch (seasonError) {
          console.log(`[PUBG] Season stats unavailable for ${playerName}: ${seasonError.message}`);
        }
      }

      const selectedSeasonId = seasonData?.id || targetSeasonId || seasonCatalog?.currentSeasonId || null;
      const displayPlayerName =
        isAccountIdentifier(playerName) && !isAccountIdentifier(requestedPlayerId)
          ? requestedPlayerId
          : playerName;

      setCachedPlayerName(shard, accountId, displayPlayerName);
      const mappedData = mapPubgStatsToFrontend(
        lifetimeAttributes,
        displayPlayerName,
        accountId,
        seasonData,
        rankedSeasonData,
        seasonCatalog,
        selectedSeasonId,
        shard,
        shard === "steam" ? await getBestEffortSteamAvatar(requestedPlayerId, displayPlayerName) : null
      );

      const cacheEntry = {
        data: mappedData,
        timestamp: Date.now(),
      };
      statsCache.set(statsCacheKey, cacheEntry);
      setStalePlayerData(requestKey, mappedData);
      if (displayPlayerName && displayPlayerName !== requestedPlayerId && !isAccountIdentifier(displayPlayerName)) {
        setStalePlayerData(`${shard}:${displayPlayerName}:${requestedSeasonId || "current"}`, mappedData);
      }

      return mappedData;
    } catch (e) {
      if (String(e.message).includes("Rate Limit")) {
        const stale =
          staleByRequest ||
          getStalePlayerData(requestKey) ||
          getStalePlayerData(`${shard}:${requestedPlayerId}:current`);
        if (stale) {
          console.log(`[PUBG] Rate limited, serving stale cache for ${requestedPlayerId}`);
          return stale;
        }
      }

      console.log("PUBG API Error:", e.message);
      throw Error(e.message);
    } finally {
      inFlightRankRequests.delete(requestKey);
    }
  })();

  inFlightRankRequests.set(requestKey, run);
  return run;
};
