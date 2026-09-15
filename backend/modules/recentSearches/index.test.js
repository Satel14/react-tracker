const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  addRecentSearch,
  getRecentSearches,
  __setRecentSearchesFile,
  __setRecentSearchesPool,
} = require("./index");

let tmpFile;
let savedDatabaseUrl;

beforeEach(() => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  tmpFile = path.join(
    os.tmpdir(),
    `recent-index-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );
  __setRecentSearchesFile(tmpFile);
});

afterEach(async () => {
  if (savedDatabaseUrl !== undefined) {
    process.env.DATABASE_URL = savedDatabaseUrl;
  }
  __setRecentSearchesPool(null);
  __setRecentSearchesFile(null);
  await fs.rm(tmpFile, { force: true });
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

test("routes to the pg store when a pool is configured, without touching the file", async () => {
  const pool = createFakePool(async (text) => {
    if (text.includes("SELECT")) {
      return {
        rows: [{
          id: "steam:Neo",
          game_id: "Neo",
          platform: "steam",
          nickname: "Neo",
          avatar: null,
          rank_icon_url: null,
          rank_label: null,
          rating: 2100,
          searched_at: "1783084548082",
        }],
      };
    }
    return { rows: [] };
  });
  __setRecentSearchesPool(pool);

  const added = await addRecentSearch({ gameId: "Neo", platform: "steam" });
  const fetched = await getRecentSearches(10);

  assert.equal(added[0].id, "steam:Neo");
  assert.equal(fetched[0].id, "steam:Neo");
  assert.ok(pool.calls.some((c) => c.text.includes("ON CONFLICT")), "write must hit Postgres");
  await assert.rejects(fs.access(tmpFile), "file store must not be touched on the pg path");
});

test("falls back to the file store when pg is not configured", async () => {
  await addRecentSearch({ gameId: "Trinity", platform: "steam" });

  const parsed = JSON.parse(await fs.readFile(tmpFile, "utf8"));
  assert.equal(parsed[0].id, "steam:Trinity");

  const records = await getRecentSearches(10);
  assert.equal(records[0].id, "steam:Trinity");
});

const SELECT_ROW = {
  id: "steam:Neo",
  game_id: "Neo",
  platform: "steam",
  nickname: "Neo",
  avatar: null,
  rank_icon_url: null,
  rank_label: null,
  rating: 2100,
  searched_at: "1783084548082",
};

function countSelects(pool) {
  return pool.calls.filter((c) => c.text.includes("SELECT") && !c.text.includes("DELETE")).length;
}

function createSelectPool(rows) {
  return createFakePool(async (text) => (text.includes("SELECT") ? { rows } : { rows: [] }));
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a pre-write SELECT cannot repopulate an invalidated recent-search cache", async () => {
  const started = deferred();
  const oldSelect = deferred();
  const updated = { ...SELECT_ROW, id: "steam:Trinity", game_id: "Trinity", nickname: "Trinity" };
  let reads = 0;
  const pool = createFakePool(async (text) => {
    if (!text.trimStart().startsWith("SELECT")) return { rows: [] };
    reads += 1;
    if (reads === 1) {
      started.resolve();
      return oldSelect.promise;
    }
    return { rows: [updated] };
  });
  __setRecentSearchesPool(pool);
  const beforeWrite = getRecentSearches(10);
  await started.promise;
  await addRecentSearch({ gameId: "Trinity", platform: "steam" }, 10);
  oldSelect.resolve({ rows: [SELECT_ROW] });
  await beforeWrite;
  assert.equal((await getRecentSearches(10))[0].id, "steam:Trinity");
  assert.equal(reads, 2, "the write already supplied a fresh cached result");
});

test("post-write readers coalesce on a new SELECT even while the old SELECT finishes", async () => {
  const started = deferred();
  const oldSelect = deferred();
  const newSelect = deferred();
  const updated = { ...SELECT_ROW, id: "steam:Trinity", game_id: "Trinity", nickname: "Trinity" };
  let reads = 0;
  const pool = createFakePool(async (text, params) => {
    if (!text.trimStart().startsWith("SELECT")) return { rows: [] };
    reads += 1;
    if (params[0] === 20) return { rows: [updated] };
    if (reads === 1) {
      started.resolve();
      return oldSelect.promise;
    }
    return newSelect.promise;
  });
  __setRecentSearchesPool(pool);
  const beforeWrite = getRecentSearches(10);
  await started.promise;
  await addRecentSearch({ gameId: "Trinity", platform: "steam" }, 20);
  const afterWrite = getRecentSearches(10);
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 3, "a new reader must not join the obsolete SELECT");
    oldSelect.resolve({ rows: [SELECT_ROW] });
    await beforeWrite;
    const concurrent = getRecentSearches(10);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 3, "the obsolete SELECT must not delete the newer flight");
    newSelect.resolve({ rows: [updated] });
    assert.equal((await concurrent)[0].id, "steam:Trinity");
    assert.equal((await afterWrite)[0].id, "steam:Trinity");
  } finally {
    oldSelect.resolve({ rows: [SELECT_ROW] });
    newSelect.resolve({ rows: [updated] });
    await Promise.all([beforeWrite, afterWrite]);
  }
});

test("serves a repeat read from cache instead of querying Postgres again", async () => {
  const pool = createSelectPool([SELECT_ROW]);
  __setRecentSearchesPool(pool);

  const first = await getRecentSearches(10);
  const second = await getRecentSearches(10);

  assert.equal(first[0].id, "steam:Neo");
  assert.deepEqual(second, first);
  assert.equal(countSelects(pool), 1, "second read must be served from cache");
});

test("coalesces concurrent reads into a single Postgres query", async () => {
  const pool = createSelectPool([SELECT_ROW]);
  __setRecentSearchesPool(pool);

  const [a, b, c] = await Promise.all([
    getRecentSearches(10),
    getRecentSearches(10),
    getRecentSearches(10),
  ]);

  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.equal(countSelects(pool), 1, "concurrent reads must share one in-flight query");
});

test("re-reads a populated list once the cache duration expires", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const pool = createSelectPool([SELECT_ROW]);
  __setRecentSearchesPool(pool);

  await getRecentSearches(10);
  t.mock.timers.tick(31 * 1000);
  await getRecentSearches(10);

  assert.equal(countSelects(pool), 2, "cache must expire after its TTL");
});

test("expires a cached empty list quickly so a failed read cannot pin a blank widget", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  // Both stores swallow storage errors and return [], so an empty answer may
  // really be a failure in disguise.
  const pool = createSelectPool([]);
  __setRecentSearchesPool(pool);

  await getRecentSearches(10);
  t.mock.timers.tick(6 * 1000);
  await getRecentSearches(10);

  assert.equal(countSelects(pool), 2, "an empty result must not be held for the full TTL");
});

test("a write invalidates the cached list", async () => {
  let rows = [SELECT_ROW];
  const pool = createFakePool(async (text) => {
    if (text.includes("SELECT")) return { rows };
    if (text.includes("ON CONFLICT")) {
      rows = [{ ...SELECT_ROW, id: "steam:Trinity", game_id: "Trinity", nickname: "Trinity" }];
    }
    return { rows: [] };
  });
  __setRecentSearchesPool(pool);

  const before = await getRecentSearches(10);
  assert.equal(before[0].id, "steam:Neo");

  await addRecentSearch({ gameId: "Trinity", platform: "steam" });

  const after = await getRecentSearches(10);
  assert.equal(after[0].id, "steam:Trinity", "cached list must not survive a write");
});
