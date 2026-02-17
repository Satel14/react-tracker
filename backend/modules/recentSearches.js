const fs = require("fs/promises");
const path = require("path");
const {
  isAccountIdentifier,
  normalizePlatform,
  stripPlatformPrefix,
} = require("./playerIdentity");

const RECENT_SEARCHES_FILE = path.join(__dirname, "..", "json", "last-searcheds.json");
const MAX_RECENT_SEARCHES = 20;
let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

async function readRecentSearches() {
  try {
    const raw = await fs.readFile(RECENT_SEARCHES_FILE, "utf8");
    if (!raw || !raw.trim()) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      return Object.values(parsed);
    }

    return [];
  } catch (e) {
    if (e?.code === "ENOENT") return [];
    return [];
  }
}

async function writeRecentSearches(list) {
  try {
    await fs.mkdir(path.dirname(RECENT_SEARCHES_FILE), { recursive: true });
    await fs.writeFile(RECENT_SEARCHES_FILE, JSON.stringify(list, null, 2), "utf8");
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
  const rankIconUrl =
    typeof entry.rankIconUrl === "string" && entry.rankIconUrl.trim() ? entry.rankIconUrl.trim() : null;
  const rankLabel =
    typeof entry.rankLabel === "string" && entry.rankLabel.trim() ? entry.rankLabel.trim() : null;
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
    rankIconUrl,
    rankLabel,
    rating: Number.isFinite(rating) ? rating : null,
    searchedAt,
  };
}

async function getRecentSearches(limit = 10) {
  const records = (await readRecentSearches())
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

async function addRecentSearch(entry, maxItems = MAX_RECENT_SEARCHES) {
  return enqueueMutation(async () => {
    const normalized = normalizeRecentEntry(entry);
    if (!normalized) return getRecentSearches(maxItems);

    const current = (await readRecentSearches())
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

    await writeRecentSearches(deduped);
    return deduped.slice().sort((a, b) => (b.searchedAt || 0) - (a.searchedAt || 0));
  });
}

module.exports = {
  addRecentSearch,
  getRecentSearches,
};
