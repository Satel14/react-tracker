const fileStore = require("./fileStore");
const { MAX_RECENT_SEARCHES, normalizeRecentEntry } = require("./normalize");

async function getRecentSearches(limit = 10) {
  return fileStore.getRecentSearches(limit);
}

async function addRecentSearch(entry, maxItems = MAX_RECENT_SEARCHES) {
  const normalized = normalizeRecentEntry(entry);
  if (!normalized) return fileStore.getRecentSearches(maxItems);
  return fileStore.addRecentSearch(normalized, maxItems);
}

module.exports = {
  addRecentSearch,
  getRecentSearches,
  __setRecentSearchesFile: fileStore.__setRecentSearchesFile,
};
