const fs = require("fs/promises");
const path = require("path");
const { normalizeRecentEntry } = require("./normalize");

const DEFAULT_RECENT_SEARCHES_FILE = path.join(__dirname, "..", "..", "json", "last-searcheds.json");
let recentSearchesFile = DEFAULT_RECENT_SEARCHES_FILE;
let tmpWriteCounter = 0;
let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

async function readRecentSearches() {
  try {
    const raw = await fs.readFile(recentSearchesFile, "utf8");
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
    await fs.mkdir(path.dirname(recentSearchesFile), { recursive: true });
    tmpWriteCounter += 1;
    const tmpFile = `${recentSearchesFile}.${process.pid}.${tmpWriteCounter}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(list, null, 2), "utf8");
    await fs.rename(tmpFile, recentSearchesFile);
  } catch (e) {
    console.log(`[RECENT] Failed to write file: ${e.message}`);
  }
}

async function loadRecentSearches(limit) {
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

async function getRecentSearches(limit) {
  return enqueueMutation(() => loadRecentSearches(limit));
}

async function addRecentSearch(normalized, maxItems) {
  return enqueueMutation(async () => {
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

function __setRecentSearchesFile(filePath) {
  recentSearchesFile = filePath || DEFAULT_RECENT_SEARCHES_FILE;
}

module.exports = {
  addRecentSearch,
  getRecentSearches,
  __setRecentSearchesFile,
};
