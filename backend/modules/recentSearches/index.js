const fileStore = require("./fileStore");
const pgStore = require("./pgStore");
const { MAX_RECENT_SEARCHES, normalizeRecentEntry } = require("./normalize");

// Every home-page visit reads this list, but it only changes when somebody looks
// a player up, so a short TTL keeps the endpoint off Postgres without making the
// list feel stale.
const RECENT_CACHE_DURATION = 30 * 1000;
// Both stores swallow storage errors and return [], which is indistinguishable
// from a genuinely empty table. Expire that answer quickly so a transient Neon
// failure cannot pin a blank list for the whole TTL.
const RECENT_EMPTY_CACHE_DURATION = 5 * 1000;
const RECENT_STALE_DURATION = 10 * 60 * 1000;

const recentCache = new Map();
const inFlightRecentRequests = new Map();

function getStore() {
  return pgStore.isConfigured() ? pgStore : fileStore;
}

function getFreshEntry(limit) {
  const entry = recentCache.get(limit);
  if (!entry) return null;

  const maxAge = entry.data.length ? RECENT_CACHE_DURATION : RECENT_EMPTY_CACHE_DURATION;
  return Date.now() - entry.timestamp < maxAge ? entry : null;
}

async function getRecentSearches(limit = 10) {
  const fresh = getFreshEntry(limit);
  if (fresh) return fresh.data;

  const inFlight = inFlightRecentRequests.get(limit);
  if (inFlight) return inFlight;

  const run = (async () => {
    try {
      const data = await getStore().getRecentSearches(limit);
      recentCache.set(limit, { data, timestamp: Date.now() });
      return data;
    } catch (e) {
      const stale = recentCache.get(limit);
      if (stale && Date.now() - stale.timestamp < RECENT_STALE_DURATION) {
        console.log(`[RECENT] Failed to refresh, serving stale list: ${e.message}`);
        return stale.data;
      }
      throw e;
    } finally {
      inFlightRecentRequests.delete(limit);
    }
  })();

  inFlightRecentRequests.set(limit, run);
  return run;
}

async function addRecentSearch(entry, maxItems = MAX_RECENT_SEARCHES) {
  const store = getStore();
  const normalized = normalizeRecentEntry(entry);
  if (!normalized) return getRecentSearches(maxItems);

  const data = await store.addRecentSearch(normalized, maxItems);
  recentCache.clear();
  recentCache.set(maxItems, { data, timestamp: Date.now() });
  return data;
}

// Opens the Postgres connection and runs the lazy CREATE TABLE at boot so the
// first visitor does not pay the TLS handshake, the Neon wake and the DDL round
// trip on top of their own request.
async function warmRecentSearches() {
  try {
    await getRecentSearches();
  } catch (e) {
    console.log(`[RECENT] Warmup failed: ${e.message}`);
  }
}

module.exports = {
  addRecentSearch,
  getRecentSearches,
  warmRecentSearches,
  __setRecentSearchesFile: (filePath) => {
    recentCache.clear();
    return fileStore.__setRecentSearchesFile(filePath);
  },
  __setRecentSearchesPool: (nextPool) => {
    recentCache.clear();
    return pgStore.__setRecentSearchesPool(nextPool);
  },
};
