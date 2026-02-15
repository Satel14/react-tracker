const PUBG_REPORT_API_BASE = "https://api.pubg.report";

const reportsCache = new Map();
const REPORTS_CACHE_DURATION = 3 * 60 * 1000;
const MAX_ENCOUNTERS = 120;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAccountId(accountId) {
  const normalized = normalizeString(accountId);
  if (!normalized) return null;
  if (normalized.startsWith("account.")) return normalized;
  if (/^[a-f0-9]{32}$/i.test(normalized)) return `account.${normalized}`;
  return null;
}

async function doRequest(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`PUBG Report API error: ${response.status}`);
  }

  return response.json();
}

async function resolvePlayerId(accountId, playerName) {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (normalizedAccountId) return normalizedAccountId;

  const normalizedName = normalizeString(playerName);
  if (!normalizedName) return null;

  const searchUrl = `${PUBG_REPORT_API_BASE}/search/${encodeURIComponent(normalizedName)}`;
  const candidates = await doRequest(searchUrl);
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const exact = candidates.find(
    (item) => normalizeString(item?.nickname).toLowerCase() === normalizedName.toLowerCase()
  );
  return exact?.id || candidates[0]?.id || null;
}

function flattenStreamsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  return Object.values(payload).flatMap((value) => (Array.isArray(value) ? value : []));
}

function toTwitchTimestamp(timeDiff) {
  if (typeof timeDiff !== "string") return "";
  const parts = timeDiff.split(":");
  if (parts.length !== 3) return "";

  const [hRaw, mRaw, sRaw] = parts;
  const hours = Number(hRaw);
  const minutes = Number(mRaw);
  const seconds = Number(sRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return "";
  }

  return `${Math.max(0, hours)}h${Math.max(0, minutes)}m${Math.max(0, seconds)}s`;
}

function getEncounterType(playerName, killer, victim) {
  const normalizedPlayer = normalizeString(playerName).toLowerCase();
  const normalizedKiller = normalizeString(killer).toLowerCase();
  const normalizedVictim = normalizeString(victim).toLowerCase();

  const isKiller = normalizedPlayer && normalizedKiller === normalizedPlayer;
  const isVictim = normalizedPlayer && normalizedVictim === normalizedPlayer;

  if (isKiller && isVictim) return "self";
  if (isKiller) return "kill";
  if (isVictim) return "death";
  return "other";
}

function toTimeValue(rawTime, fallbackDate) {
  const primary = Date.parse(rawTime);
  if (Number.isFinite(primary)) return primary;

  const secondary = Date.parse(fallbackDate);
  if (Number.isFinite(secondary)) return secondary;

  return 0;
}

function mapEncounter(raw, playerName) {
  const matchId = normalizeString(raw?.MatchID);
  const attackId = raw?.AttackID !== undefined && raw?.AttackID !== null ? String(raw.AttackID) : "";
  const twitchVideoIdRaw = normalizeString(raw?.VideoID);
  const twitchVideoId = twitchVideoIdRaw.startsWith("v")
    ? twitchVideoIdRaw.slice(1)
    : twitchVideoIdRaw;
  const timeDiff = normalizeString(raw?.TimeDiff);
  const twitchTime = toTwitchTimestamp(timeDiff);
  const clipUrl =
    matchId && attackId ? `https://pubg.report/matches/${encodeURIComponent(matchId)}/${encodeURIComponent(attackId)}` : null;
  const videoUrl = twitchVideoId
    ? `https://www.twitch.tv/videos/${encodeURIComponent(twitchVideoId)}${twitchTime ? `?t=${encodeURIComponent(twitchTime)}` : ""}`
    : null;

  return {
    id:
      normalizeString(raw?.ID) ||
      `${matchId}:${attackId || normalizeString(raw?.TimeEvent) || normalizeString(raw?.Date)}`,
    type: getEncounterType(playerName, raw?.Killer, raw?.Victim),
    eventType: normalizeString(raw?.Event),
    killer: normalizeString(raw?.Killer),
    victim: normalizeString(raw?.Victim),
    mode: normalizeString(raw?.Mode),
    map: normalizeString(raw?.Map),
    distance: Number(raw?.Distance || 0),
    timeDiff,
    timeEvent: normalizeString(raw?.TimeEvent),
    dateLabel: normalizeString(raw?.Date),
    matchId,
    attackId,
    twitchVideoId,
    twitchChannelId: raw?.TwitchID !== undefined && raw?.TwitchID !== null ? String(raw.TwitchID) : null,
    links: {
      clip: clipUrl,
      twitch: videoUrl,
    },
    sortTime: toTimeValue(raw?.TimeEvent, raw?.Date),
  };
}

function buildSummary(encounters) {
  const kills = encounters.filter((item) => item.type === "kill").length;
  const deaths = encounters.filter((item) => item.type === "death").length;

  return {
    total: encounters.length,
    kills,
    deaths,
    latestEncounterAt: encounters[0]?.timeEvent || encounters[0]?.dateLabel || null,
  };
}

module.exports.getPlayerReports = async ({ accountId, playerName }) => {
  const normalizedName = normalizeString(playerName);
  const normalizedAccountId = normalizeAccountId(accountId);
  const cacheKey = `${normalizedAccountId || ""}:${normalizedName.toLowerCase()}`;
  const cached = reportsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REPORTS_CACHE_DURATION) {
    return cached.data;
  }

  const playerId = await resolvePlayerId(normalizedAccountId, normalizedName);
  if (!playerId) {
    return {
      player: {
        id: null,
        name: normalizedName || null,
      },
      summary: {
        total: 0,
        kills: 0,
        deaths: 0,
        latestEncounterAt: null,
      },
      encounters: [],
    };
  }

  const streamUrl = `${PUBG_REPORT_API_BASE}/v1/players/${encodeURIComponent(playerId)}/streams`;
  const rawPayload = await doRequest(streamUrl);
  const flatEvents = flattenStreamsPayload(rawPayload);

  const mapped = flatEvents
    .map((item) => mapEncounter(item, normalizedName))
    .filter((item) => item.type === "kill" || item.type === "death")
    .sort((a, b) => b.sortTime - a.sortTime)
    .slice(0, MAX_ENCOUNTERS)
    .map(({ sortTime, ...rest }) => rest);

  const data = {
    player: {
      id: playerId,
      name: normalizedName || null,
    },
    summary: buildSummary(mapped),
    encounters: mapped,
  };

  reportsCache.set(cacheKey, {
    timestamp: Date.now(),
    data,
  });

  return data;
};
