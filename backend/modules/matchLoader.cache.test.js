const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const pubgTelemetry = require("./pubgTelemetry");

const matchJson = {
  data: {
    attributes: { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" },
    relationships: { assets: { data: [{ id: "a1" }] } },
  },
  included: [{ type: "asset", id: "a1", attributes: { URL: "https://telemetry.example/t.json" } }],
};

let matchCalls = 0;
let telemetryCalls = 0;
let reportedBytes = 1024;

pubgTelemetry.fetchPubgJson = async () => {
  matchCalls += 1;
  return matchJson;
};
pubgTelemetry.fetchTelemetryJson = async () => {
  telemetryCalls += 1;
  return { telemetry: [{ _T: "LogMatchStart", characters: [] }], bytes: reportedBytes };
};

delete require.cache[require.resolve("./matchLoader")];
const {
  loadMatchBundle,
  __clearMatchCache,
  __setMatchCacheClock,
  __matchCacheStats,
} = require("./matchLoader");

const { budgetBytes, ttlMs, maxEntries } = __matchCacheStats();

// The whole fix is these policy numbers, so assert them absolutely — every other
// case below scales off them and would survive setting them to Infinity.
test("the cache policy stays inside what a 512 MB instance can hold", () => {
  assert.ok(budgetBytes <= 128 * 1024 * 1024, `budget ${budgetBytes} exceeds 128 MiB`);
  assert.ok(budgetBytes >= 16 * 1024 * 1024, `budget ${budgetBytes} is too small to be useful`);
  assert.ok(ttlMs <= 30 * 60 * 1000, `ttl ${ttlMs} exceeds 30 minutes`);
  assert.ok(maxEntries <= 48, `entry cap ${maxEntries} is too high to bound small-asset growth`);
});

test("many tiny bundles are bounded by the entry cap, not just by bytes", async () => {
  reportedBytes = 1024;
  for (let i = 0; i < maxEntries + 6; i += 1) {
    await loadMatchBundle({ shard: "steam", matchId: `tiny-${i}` });
  }
  assert.ok(__matchCacheStats().keys.length <= maxEntries);
});

test("a bundle reporting a non-finite size is not cached as if it were free", async () => {
  reportedBytes = Number.NaN;
  await loadMatchBundle({ shard: "steam", matchId: "nan-1" });
  const stats = __matchCacheStats();
  assert.ok(stats.bytes >= 0 && Number.isFinite(stats.bytes), `accounted bytes went non-finite: ${stats.bytes}`);
  assert.ok(stats.bytes <= stats.budgetBytes);
});

let clockMs = 0;

beforeEach(() => {
  __clearMatchCache();
  __setMatchCacheClock(() => clockMs);
  clockMs = 0;
  matchCalls = 0;
  telemetryCalls = 0;
  reportedBytes = 1024;
});

test("two loads of the same match inside the TTL download the telemetry once", async () => {
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  clockMs += ttlMs - 1;
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  assert.equal(telemetryCalls, 1);
  assert.equal(matchCalls, 1);
});

test("a load after the TTL expires downloads the telemetry again", async () => {
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  clockMs += ttlMs;
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  assert.equal(telemetryCalls, 2);
});

test("an expired bundle stops being accounted against the byte budget", async () => {
  reportedBytes = 4096;
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  assert.equal(__matchCacheStats().bytes, 4096);

  clockMs += ttlMs;
  await loadMatchBundle({ shard: "steam", matchId: "m2" });

  const stats = __matchCacheStats();
  assert.deepEqual(stats.keys, ["steam:m2"]);
  assert.equal(stats.bytes, 4096);
});

test("the byte budget evicts the oldest bundle and holds the ceiling", async () => {
  reportedBytes = Math.floor(budgetBytes * 0.4);
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  await loadMatchBundle({ shard: "steam", matchId: "m2" });
  assert.equal(__matchCacheStats().bytes, reportedBytes * 2);

  await loadMatchBundle({ shard: "steam", matchId: "m3" });

  const stats = __matchCacheStats();
  assert.deepEqual(stats.keys, ["steam:m2", "steam:m3"]);
  assert.ok(stats.bytes <= budgetBytes, `${stats.bytes} bytes must stay within ${budgetBytes}`);
});

test("a cache hit refreshes recency so the untouched bundle is evicted first", async () => {
  reportedBytes = Math.floor(budgetBytes * 0.4);
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  await loadMatchBundle({ shard: "steam", matchId: "m2" });
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  await loadMatchBundle({ shard: "steam", matchId: "m3" });

  assert.deepEqual(__matchCacheStats().keys, ["steam:m1", "steam:m3"]);
});

test("a burst of large bundles never pushes the accounted total past the ceiling", async () => {
  reportedBytes = Math.floor(budgetBytes * 0.3);
  for (let i = 0; i < 30; i += 1) {
    await loadMatchBundle({ shard: "steam", matchId: `burst-${i}` });
    const { bytes } = __matchCacheStats();
    assert.ok(bytes <= budgetBytes, `after ${i + 1} bundles the total was ${bytes}`);
  }
  assert.equal(__matchCacheStats().keys.length, 3);
});

test("a bundle bigger than the whole budget is returned but never cached", async () => {
  reportedBytes = budgetBytes + 1;
  const bundle = await loadMatchBundle({ shard: "steam", matchId: "huge" });
  assert.ok(Array.isArray(bundle.telemetry));

  const stats = __matchCacheStats();
  assert.equal(stats.bytes, 0);
  assert.deepEqual(stats.keys, []);

  await loadMatchBundle({ shard: "steam", matchId: "huge" });
  assert.equal(telemetryCalls, 2);
});
