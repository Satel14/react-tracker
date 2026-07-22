const fileStore = require("./fileStore");
const pgStore = require("./pgStore");
const { MAX_RECENT_SEARCHES, normalizeRecentEntry } = require("./normalize");

function getStore() {
  return pgStore.isConfigured() ? pgStore : fileStore;
}

async function getRecentSearches(limit = 10) {
  return getStore().getRecentSearches(limit);
}

async function addRecentSearch(entry, maxItems = MAX_RECENT_SEARCHES) {
  const store = getStore();
  const normalized = normalizeRecentEntry(entry);
  if (!normalized) return store.getRecentSearches(maxItems);
  return store.addRecentSearch(normalized, maxItems);
}

module.exports = {
  addRecentSearch,
  getRecentSearches,
  __setRecentSearchesFile: fileStore.__setRecentSearchesFile,
  __setRecentSearchesPool: pgStore.__setRecentSearchesPool,
};
