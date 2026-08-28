const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRankPointHistoryService, createNoopRankPointHistoryService, READ_TIMEOUT_MS } = require("./index");

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-08-26T18:00:00Z");
const NOW = T0 + 3 * H;
const KEY = { shard: "steam", accountId: "account." + "b".repeat(32), seasonId: "division.bro.official.pc-2018-42" };
const RANKED = { "squad-fpp": { currentRankPoint: 3023, roundsPlayed: 101, currentTier: { tier: "Gold", subTier: "1" } } };
const RANKED_INFO = { tier: "Gold", subTier: "1" };
const BASELINE = { id: 1, rankPoint: 3000, roundsPlayed: 100, tier: "Gold", modes: {}, firstSeenAt: T0, lastSeenAt: T0 };
const MATCHES = {
  summary: { total: 1 },
  items: [{ id: "m", createdAt: new Date(T0 + H).toISOString(), matchType: "competitive" }],
};

function fakeStore({ configured = true, series = [BASELINE], loadError = null, recordError = null, hang = false } = {}) {
  const calls = { load: [], record: [] };
  return {
    calls,
    isConfigured: () => configured,
    loadSeries: async (key) => {
      calls.load.push(key);
      if (hang) return new Promise(() => {});
      if (loadError) throw loadError;
      return series;
    },
    recordReading: async (key, reading, options) => {
      calls.record.push({ key, reading, options });
      if (recordError) throw recordError;
      return { changed: true };
    },
  };
}

const annotateWith = (store, overrides = {}) =>
  createRankPointHistoryService({ store, now: () => NOW, ...overrides }).annotate({
    ...KEY, rankedGameModeStats: RANKED, rankedInfo: RANKED_INFO, matches: MATCHES,
  });

test("exposes the spec's read timeout", () => {
  assert.equal(READ_TIMEOUT_MS, 3000);
});

test("passes matches through untouched when the store is not configured", async () => {
  const store = fakeStore({ configured: false });
  const result = await annotateWith(store);
  assert.equal(result, MATCHES);
  assert.equal(store.calls.load.length, 0);
});

test("passes matches through when there are no ranked modes", async () => {
  const store = fakeStore();
  const result = await createRankPointHistoryService({ store, now: () => NOW }).annotate({
    ...KEY, rankedGameModeStats: {}, rankedInfo: null, matches: MATCHES,
  });
  assert.equal(result, MATCHES);
  assert.equal(store.calls.load.length, 0);
});

// The write is fire-and-forget (queued as a microtask); let it start before asserting on it.
const flushWrites = () => new Promise((resolve) => setImmediate(resolve));

test("annotates from the stored series and records the new reading against the latest row", async () => {
  const store = fakeStore();
  const result = await annotateWith(store);
  await flushWrites();

  assert.deepEqual(result.items[0].rpDelta, { kind: "exact", value: 23 });
  assert.equal(result.summary.rankPoints, null);
  assert.deepEqual(store.calls.load, [KEY]);
  assert.equal(store.calls.record.length, 1);
  assert.deepEqual(store.calls.record[0].key, KEY);
  assert.deepEqual(store.calls.record[0].reading, {
    rankPoint: 3023, roundsPlayed: 101, tier: "Gold",
    modes: { "squad-fpp": { rankPoint: 3023, roundsPlayed: 101, tier: "Gold" } },
  });
  assert.deepEqual(store.calls.record[0].options, { latest: BASELINE, now: NOW });
});

test("a first-ever reading records with latest null and marks rows noBaseline", async () => {
  const store = fakeStore({ series: [] });
  const result = await annotateWith(store);
  await flushWrites();
  assert.deepEqual(result.items[0].rpDelta, { kind: "noBaseline" });
  assert.equal(store.calls.record[0].options.latest, null);
});

test("a failed read passes matches through and does not write", async () => {
  const store = fakeStore({ loadError: new Error("neon down") });
  const result = await annotateWith(store);
  assert.equal(result, MATCHES);
  assert.equal(store.calls.record.length, 0);
});

test("a read slower than the timeout passes matches through", async () => {
  const store = fakeStore({ hang: true });
  const started = Date.now();
  const result = await annotateWith(store, { readTimeoutMs: 20 });
  assert.equal(result, MATCHES);
  assert.ok(Date.now() - started < 1000);
  assert.equal(store.calls.record.length, 0);
});

test("a rejected write does not affect the annotated result", async () => {
  const store = fakeStore({ recordError: new Error("disk full") });
  const result = await annotateWith(store);
  await flushWrites();
  assert.deepEqual(result.items[0].rpDelta, { kind: "exact", value: 23 });
  assert.equal(store.calls.record.length, 1);
});

test("a throwing attribution degrades to the untouched matches object", async () => {
  const store = fakeStore();
  const hostile = { summary: { total: 1 }, get items() { throw new Error("boom"); } };
  const result = await createRankPointHistoryService({ store, now: () => NOW }).annotate({
    ...KEY, rankedGameModeStats: RANKED, rankedInfo: RANKED_INFO, matches: hostile,
  });
  assert.equal(result, hostile);
});

test("the noop service is a pass-through", async () => {
  const result = await createNoopRankPointHistoryService().annotate({ ...KEY, matches: MATCHES });
  assert.equal(result, MATCHES);
});
