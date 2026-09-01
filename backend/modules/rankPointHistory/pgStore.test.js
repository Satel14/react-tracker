const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { __setPool } = require("../db/pool");
const { loadSeries, recordReading, warm, SNAPSHOT_LIMIT, __resetRankPointStore } = require("./pgStore");

afterEach(() => {
  __setPool(null);
  __resetRankPointStore();
});

function createFakePool(handler) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return handler(text, params);
    },
  };
}

const KEY = { shard: "steam", accountId: "account." + "a".repeat(32), seasonId: "division.bro.official.pc-2018-42" };
const ROW = (id, rank_point, rounds_played, first_seen_at, last_seen_at = first_seen_at) => ({
  id: String(id),
  rank_point,
  rounds_played,
  tier: "Diamond",
  modes: { "squad-fpp": { rankPoint: rank_point, roundsPlayed: rounds_played, tier: "Diamond" } },
  first_seen_at: String(first_seen_at),
  last_seen_at: String(last_seen_at),
});
const READING = { rankPoint: 3176, roundsPlayed: 11, tier: "Diamond", modes: { "squad-fpp": { rankPoint: 3176, roundsPlayed: 11, tier: "Diamond" } } };

test("loadSeries creates the table and index once, then returns rows oldest-first with numbers", async () => {
  const pool = createFakePool(async (text) => {
    if (text.includes("SELECT")) return { rows: [ROW(2, 3153, 10, 2000, 2500), ROW(1, 3100, 9, 1000)] };
    return { rows: [] };
  });
  __setPool(pool);

  const first = await loadSeries(KEY);
  await loadSeries(KEY);

  assert.deepEqual(first.map((s) => s.id), [1, 2]);
  assert.deepEqual(first[1], {
    id: 2, rankPoint: 3153, roundsPlayed: 10, tier: "Diamond",
    modes: { "squad-fpp": { rankPoint: 3153, roundsPlayed: 10, tier: "Diamond" } },
    firstSeenAt: 2000, lastSeenAt: 2500,
  });
  assert.equal(pool.calls.filter((c) => c.text.includes("CREATE TABLE")).length, 1);
  assert.equal(pool.calls.filter((c) => c.text.includes("CREATE INDEX")).length, 1);
  const select = pool.calls.find((c) => c.text.includes("SELECT"));
  assert.deepEqual(select.params, [KEY.shard, KEY.accountId, KEY.seasonId, SNAPSHOT_LIMIT]);
});

test("loadSeries keeps a NULL rank_point as null", async () => {
  __setPool(createFakePool(async (text) => (text.includes("SELECT") ? { rows: [ROW(1, null, 9, 1000)] } : { rows: [] })));
  const [snapshot] = await loadSeries(KEY);
  assert.equal(snapshot.rankPoint, null);
});

test("loadSeries propagates read failures", async () => {
  __setPool(createFakePool(async (text) => {
    if (text.includes("SELECT")) throw new Error("connection refused");
    return { rows: [] };
  }));
  await assert.rejects(loadSeries(KEY), /connection refused/);
});

test("recordReading touches last_seen_at when the latest row has the same values", async () => {
  const pool = createFakePool(async () => ({ rows: [] }));
  __setPool(pool);
  const latest = { id: 7, rankPoint: 3176, roundsPlayed: 11, tier: "Diamond", modes: {}, firstSeenAt: 1000, lastSeenAt: 1000 };

  const result = await recordReading(KEY, READING, { latest, now: 5000 });

  assert.deepEqual(result, { changed: false });
  const update = pool.calls.find((c) => c.text.includes("UPDATE"));
  assert.deepEqual(update.params, [7, 5000]);
  assert.equal(pool.calls.some((c) => c.text.includes("INSERT")), false);
  assert.equal(pool.calls.some((c) => c.text.includes("DELETE")), false);
});

test("recordReading treats null === null as unchanged", async () => {
  const pool = createFakePool(async () => ({ rows: [] }));
  __setPool(pool);
  const latest = { id: 3, rankPoint: null, roundsPlayed: 11, tier: null, modes: {}, firstSeenAt: 1, lastSeenAt: 1 };
  await recordReading(KEY, { ...READING, rankPoint: null }, { latest, now: 9 });
  assert.equal(pool.calls.some((c) => c.text.includes("UPDATE")), true);
  assert.equal(pool.calls.some((c) => c.text.includes("INSERT")), false);
});

test("recordReading inserts and trims per key when the values changed", async () => {
  const pool = createFakePool(async () => ({ rows: [] }));
  __setPool(pool);
  const latest = { id: 7, rankPoint: 3153, roundsPlayed: 10, tier: "Diamond", modes: {}, firstSeenAt: 1000, lastSeenAt: 1000 };

  const result = await recordReading(KEY, READING, { latest, now: 5000 });

  assert.deepEqual(result, { changed: true });
  const insert = pool.calls.find((c) => c.text.includes("INSERT"));
  assert.deepEqual(insert.params, [
    KEY.shard, KEY.accountId, KEY.seasonId, 3176, 11, "Diamond", JSON.stringify(READING.modes), 5000,
  ]);
  const trim = pool.calls.find((c) => c.text.includes("DELETE"));
  assert.deepEqual(trim.params, [KEY.shard, KEY.accountId, KEY.seasonId, SNAPSHOT_LIMIT]);
  assert.ok(pool.calls.indexOf(insert) < pool.calls.indexOf(trim));
});

test("recordReading inserts when there is no latest row", async () => {
  const pool = createFakePool(async () => ({ rows: [] }));
  __setPool(pool);
  const result = await recordReading(KEY, READING, { latest: null, now: 5000 });
  assert.deepEqual(result, { changed: true });
  assert.equal(pool.calls.some((c) => c.text.includes("INSERT")), true);
});

test("recordReading swallows write failures", async () => {
  __setPool(createFakePool(async (text) => {
    if (text.includes("INSERT")) throw new Error("disk full");
    return { rows: [] };
  }));
  const result = await recordReading(KEY, READING, { latest: null, now: 1 });
  assert.deepEqual(result, { changed: false, error: "disk full" });
});

test("a failed CREATE TABLE is retried on the next call", async () => {
  let attempts = 0;
  const pool = createFakePool(async (text) => {
    if (text.includes("CREATE TABLE")) {
      attempts += 1;
      if (attempts === 1) throw new Error("neon waking up");
    }
    return { rows: [] };
  });
  __setPool(pool);

  await assert.rejects(loadSeries(KEY), /neon waking up/);
  await loadSeries(KEY);
  assert.equal(attempts, 2);
});

test("warm is a no-op without a pool and runs the DDL with one", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await warm();
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }

  const pool = createFakePool(async () => ({ rows: [] }));
  __setPool(pool);
  await warm();
  assert.equal(pool.calls.filter((c) => c.text.includes("CREATE TABLE")).length, 1);
});

test("a late touch never drags last_seen_at backwards", async () => {
  // Two writers observe the same values: a live page view and, later, a batched
  // write that captured its reading earlier. Whichever lands second, the row has
  // to keep the newest sighting, because attribution measures each interval from
  // it and a rewound value can invert the interval.
  const pool = createFakePool(async () => ({ rows: [] }));
  __setPool(pool);

  await recordReading(KEY, READING, { latest: { id: 7, ...READING }, now: 1000 });

  const touch = pool.calls.find((call) => call.text.includes("UPDATE rank_point_snapshots"));
  assert.ok(touch, "the unchanged reading is recorded as a touch");
  assert.match(touch.text, /GREATEST/, "the touch keeps the later of the two timestamps");
});
