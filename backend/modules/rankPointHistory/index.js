const store = require("./pgStore");
const { readRankedSnapshot, applyReading } = require("./reading");
const { attributeRankPoints } = require("./attribute");

const READ_TIMEOUT_MS = 1500;

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createRankPointHistoryService({ store: historyStore = store, now = Date.now, readTimeoutMs = READ_TIMEOUT_MS } = {}) {
  async function annotate({ shard, accountId, seasonId, rankedGameModeStats, rankedInfo, matches }) {
    if (!historyStore || !historyStore.isConfigured()) return matches;

    const reading = readRankedSnapshot(rankedGameModeStats, rankedInfo);
    if (!reading) return matches;

    const key = { shard, accountId, seasonId };
    let series;
    try {
      series = await withTimeout(historyStore.loadSeries(key), readTimeoutMs);
    } catch (e) {
      console.log(`[RP] history unavailable for ${accountId}: ${e.message}`);
      return matches;
    }

    const capturedAt = now();
    const latest = series.length ? series[series.length - 1] : null;
    // Fire-and-forget: the response must not wait on, or fail with, the write.
    Promise.resolve()
      .then(() => historyStore.recordReading(key, reading, { latest, now: capturedAt }))
      .catch((e) => console.log(`[RP] snapshot write rejected for ${accountId}: ${e.message}`));

    return attributeRankPoints({ series: applyReading(series, reading, capturedAt), matches });
  }

  return { annotate };
}

function createNoopRankPointHistoryService() {
  return { annotate: async ({ matches }) => matches };
}

async function warmRankPointHistory() {
  await store.warm();
}

module.exports = {
  createRankPointHistoryService,
  createNoopRankPointHistoryService,
  warmRankPointHistory,
  READ_TIMEOUT_MS,
};
