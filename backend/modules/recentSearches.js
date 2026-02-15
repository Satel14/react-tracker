const fs = require("fs");
const path = require("path");

const RECENT_SEARCHES_FILE = path.join(__dirname, "..", "json", "last-searcheds.json");
const MAX_RECENT_SEARCHES = 20;

function normalizePlatform(platform) {
  const value = String(platform || "steam").trim().toLowerCase();
  if (value === "xbl") return "xbox";
  return value || "steam";
}

function isAccountIdentifier(value) {
  return typeof value === "string" && /^account\./i.test(value.trim());
}

function stripPlatformPrefix(value, platform) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const prefix = `${normalizePlatform(platform)}:`;
  if (raw.toLowerCase().startsWith(prefix)) {
    return raw.slice(prefix.length);
  }

  return raw;
}

function readRecentSearches() {
  try {
    if (!fs.existsSync(RECENT_SEARCHES_FILE)) {
      return [];
    }

    const raw = fs.readFileSync(RECENT_SEARCHES_FILE, "utf8");
    if (!raw || !raw.trim()) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      return Object.values(parsed);
    }

    return [];
  } catch (_e) {
    return [];
  }
}

function writeRecentSearches(list) {
  try {
    fs.writeFileSync(RECENT_SEARCHES_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.log(`[RECENT] Failed to write file: ${e.message}`);
  }
}

function normalizeRecentEntry(entry = {}) {
  const platform = normalizePlatform(entry.platform);
  const gameId = stripPlatformPrefix(String(entry.gameId || entry.id || "").trim(), platform);
  if (!gameId) return null;

  const rawNickname = stripPlatformPrefix(String(entry.nickname || "").trim(), platform);
  const nickname =
    rawNickname && !(isAccountIdentifier(rawNickname) && !isAccountIdentifier(gameId))
      ? rawNickname
      : gameId;
  const avatar = typeof entry.avatar === "string" && entry.avatar.trim() ? entry.avatar.trim() : null;
  const rating =
    entry.rating === null || entry.rating === undefined || entry.rating === ""
      ? null
      : Number(entry.rating);
  const searchedAt =
    Number.isFinite(Number(entry.searchedAt)) && Number(entry.searchedAt) > 0
      ? Number(entry.searchedAt)
      : 0;

  return {
    id: `${platform}:${gameId}`,
    gameId,
    platform,
    nickname,
    avatar,
    rating: Number.isFinite(rating) ? rating : null,
    searchedAt,
  };
}

function getRecentSearches(limit = 10) {
  const records = readRecentSearches()
    .map((item) => normalizeRecentEntry(item))
    .filter(Boolean)
    .filter((item) => Number(item.searchedAt) > 0)
    .sort((a, b) => (b.searchedAt || 0) - (a.searchedAt || 0));

  const safeLimit = Number(limit);
  if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
    return records;
  }

  return records.slice(0, safeLimit);
}

function addRecentSearch(entry, maxItems = MAX_RECENT_SEARCHES) {
  const normalized = normalizeRecentEntry(entry);
  if (!normalized) return getRecentSearches(maxItems);

  const current = readRecentSearches()
    .map((item) => normalizeRecentEntry(item))
    .filter(Boolean);

  const deduped = current.filter((item) => item.id !== normalized.id);
  deduped.push({
    ...normalized,
    searchedAt: Date.now(),
  });

  while (deduped.length > maxItems) {
    deduped.shift();
  }

  writeRecentSearches(deduped);
  return deduped.slice().sort((a, b) => (b.searchedAt || 0) - (a.searchedAt || 0));
}

module.exports = {
  addRecentSearch,
  getRecentSearches,
};
