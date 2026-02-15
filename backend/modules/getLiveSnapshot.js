const fs = require("fs");
const path = require("path");

const PUBG_API_KEY = process.env.PUBG_API_KEY || "";
const STEAM_PUBG_APP_ID = 578080;
const SEASON_DATES_PATH = path.join(__dirname, "..", "json", "season-dates.json");

const LIVE_CACHE_DURATION = 60 * 1000;
const LIVE_STALE_DURATION = 15 * 60 * 1000;
const SEASON_DATES_CACHE_DURATION = 60 * 1000;

let liveCache = null;
let inFlightSnapshot = null;
let seasonDatesCache = {
  timestamp: 0,
  data: null,
};

function parseSeasonNumber(seasonId) {
  if (typeof seasonId !== "string") return null;
  const match = seasonId.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function parseDateSafe(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toSeasonLabel(seasonId) {
  const number = parseSeasonNumber(seasonId);
  if (Number.isFinite(number)) return `Season #${number}`;
  return seasonId || null;
}

function parseSeasonEndDate() {
  const raw = process.env.PUBG_SEASON_END_AT || process.env.PUBG_SEASON_END_DATE || "";
  if (!raw || typeof raw !== "string") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function readSeasonDatesConfig() {
  if (
    seasonDatesCache.data &&
    Date.now() - seasonDatesCache.timestamp < SEASON_DATES_CACHE_DURATION
  ) {
    return seasonDatesCache.data;
  }

  try {
    const raw = fs.readFileSync(SEASON_DATES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    seasonDatesCache = {
      timestamp: Date.now(),
      data: parsed,
    };
    return parsed;
  } catch (e) {
    if (seasonDatesCache.data) {
      return seasonDatesCache.data;
    }
    return null;
  }
}

function getSeasonOverride(season) {
  const config = readSeasonDatesConfig();
  if (!config || typeof config !== "object") return null;

  const seasons = config?.seasons;
  if (!seasons || typeof seasons !== "object") return null;

  const byId = season?.id ? seasons[season.id] : null;
  const byNumber = Number.isFinite(season?.number) ? seasons[String(season.number)] : null;
  const override = byId || byNumber;
  if (!override || typeof override !== "object") return null;

  const startDate = parseDateSafe(override.startDate);
  let endDate = parseDateSafe(override.endDate);
  const cycleDaysRaw = override.cycleDays ?? config?.defaults?.cycleDays;
  const cycleDays = Number(cycleDaysRaw);

  if (!endDate && startDate && Number.isFinite(cycleDays) && cycleDays > 0) {
    endDate = new Date(startDate.getTime() + cycleDays * 24 * 60 * 60 * 1000);
  }

  return {
    startDate,
    endDate,
    cycleDays: Number.isFinite(cycleDays) ? cycleDays : null,
    note: typeof override.note === "string" ? override.note : null,
    isEstimated: Boolean(override.isEstimated || !override.endDate),
    source: override.source || "manual-json",
  };
}

function calculateDaysLeft(targetDate) {
  if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return null;
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

async function fetchPlayersOnline() {
  const response = await fetch(
    `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_PUBG_APP_ID}`
  );

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.status}`);
  }

  const data = await response.json();
  const count = Number(data?.response?.player_count);
  if (!Number.isFinite(count)) {
    throw new Error("Steam API returned invalid player count");
  }

  return count;
}

async function fetchCurrentSeason() {
  if (!PUBG_API_KEY) {
    return {
      id: null,
      label: null,
      number: null,
    };
  }

  const response = await fetch("https://api.pubg.com/shards/steam/seasons", {
    headers: {
      Authorization: `Bearer ${PUBG_API_KEY}`,
      Accept: "application/vnd.api+json",
    },
  });

  if (!response.ok) {
    throw new Error(`PUBG API error: ${response.status}`);
  }

  const data = await response.json();
  const currentSeason = (data?.data || []).find((season) => Boolean(season?.attributes?.isCurrentSeason)) || null;
  const seasonId = currentSeason?.id || null;
  const startDateFromApi =
    parseDateSafe(currentSeason?.attributes?.startDate) ||
    parseDateSafe(currentSeason?.attributes?.start_date) ||
    parseDateSafe(currentSeason?.startDate) ||
    null;
  const endDateFromApi =
    parseDateSafe(currentSeason?.attributes?.endDate) ||
    parseDateSafe(currentSeason?.attributes?.end_date) ||
    parseDateSafe(currentSeason?.endDate) ||
    null;

  return {
    id: seasonId,
    label: toSeasonLabel(seasonId),
    number: parseSeasonNumber(seasonId),
    startDate: startDateFromApi ? startDateFromApi.toISOString() : null,
    endDate: endDateFromApi ? endDateFromApi.toISOString() : null,
  };
}

async function buildLiveSnapshot() {
  const [playersOnline, season] = await Promise.all([fetchPlayersOnline(), fetchCurrentSeason()]);
  const seasonOverride = getSeasonOverride(season);
  const seasonStartDateFromApi = parseDateSafe(season?.startDate);
  const seasonEndDateFromApi = parseDateSafe(season?.endDate);
  const seasonStartDateFromManual = seasonOverride?.startDate || null;
  const seasonEndDateFromManual = seasonOverride?.endDate || null;
  const seasonEndDateFromEnv = parseSeasonEndDate();
  const seasonStartDate = seasonStartDateFromApi || seasonStartDateFromManual;
  const seasonEndDate = seasonEndDateFromApi || seasonEndDateFromManual || seasonEndDateFromEnv;
  const countdownSource = seasonEndDateFromApi
    ? "pubg-api"
    : seasonEndDateFromManual
    ? seasonOverride?.source || "manual-json"
    : seasonEndDateFromEnv
    ? "env"
    : "unavailable";
  const isEstimated =
    countdownSource === "pubg-api" || countdownSource === "env"
      ? false
      : Boolean(seasonOverride?.isEstimated);

  return {
    updatedAt: new Date().toISOString(),
    playersOnline: {
      value: playersOnline,
      source: "steam",
    },
    season: {
      id: season.id,
      label: season.label,
      number: season.number,
      startDate: seasonStartDate ? seasonStartDate.toISOString() : null,
      endDate: seasonEndDate ? seasonEndDate.toISOString() : null,
      endsInDays: calculateDaysLeft(seasonEndDate),
      countdownSource,
      isEstimated,
      note: seasonOverride?.note || null,
    },
  };
}

module.exports.getLiveSnapshot = async () => {
  if (liveCache && Date.now() - liveCache.timestamp < LIVE_CACHE_DURATION) {
    return liveCache.data;
  }

  if (inFlightSnapshot) {
    return inFlightSnapshot;
  }

  inFlightSnapshot = (async () => {
    try {
      const data = await buildLiveSnapshot();
      liveCache = {
        timestamp: Date.now(),
        data,
      };
      return data;
    } catch (e) {
      if (liveCache && Date.now() - liveCache.timestamp < LIVE_STALE_DURATION) {
        console.log(`[LIVE] Failed to refresh, serving stale snapshot: ${e.message}`);
        return liveCache.data;
      }
      throw e;
    } finally {
      inFlightSnapshot = null;
    }
  })();

  return inFlightSnapshot;
};
