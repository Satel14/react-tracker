const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  isConfigured,
  getRecentSearches,
  addRecentSearch,
  __createRecentSearchesPool,
  __setRecentSearchesPool,
} = require("./pgStore");

afterEach(() => {
  __setRecentSearchesPool(null);
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

const SAMPLE_ROW = {
  id: "steam:Neo",
  game_id: "Neo",
  platform: "steam",
  nickname: "Neo",
  avatar: null,
  rank_icon_url: null,
  rank_label: null,
  rating: 2100,
  searched_at: "1783084548082", // pg returns BIGINT as a string
};

const NORMALIZED_ENTRY = {
  id: "steam:Neo",
  gameId: "Neo",
  platform: "steam",
  nickname: "Neo",
  avatar: null,
  rankIconUrl: null,
  rankLabel: null,
  rating: 2100.4,
  searchedAt: 0,
};

test("isConfigured reflects DATABASE_URL and the pool override", () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(isConfigured(), false);
    process.env.DATABASE_URL = "postgres://user:pass@host/db";
    assert.equal(isConfigured(), true);
    delete process.env.DATABASE_URL;
    __setRecentSearchesPool(createFakePool(async () => ({ rows: [] })));
    assert.equal(isConfigured(), true);
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
    else delete process.env.DATABASE_URL;
  }
});

test("getRecentSearches creates the table once, selects with limit, maps BIGINT strings", async () => {
  const pool = createFakePool(async (text) => {
    if (text.includes("SELECT")) return { rows: [SAMPLE_ROW] };
    return { rows: [] };
  });
  __setRecentSearchesPool(pool);

  const first = await getRecentSearches(10);
  await getRecentSearches(5);

  const creates = pool.calls.filter((c) => c.text.includes("CREATE TABLE IF NOT EXISTS recent_searches"));
  assert.equal(creates.length, 1, "table init must be memoized across calls");

  const select = pool.calls.find((c) => c.text.includes("SELECT"));
  assert.deepEqual(select.params, [10]);

  assert.equal(first.length, 1);
  assert.equal(first[0].id, "steam:Neo");
  assert.equal(first[0].searchedAt, 1783084548082);
  assert.equal(first[0].rating, 2100);
});

test("addRecentSearch upserts with rounded rating, trims to maxItems, returns the list", async () => {
  const pool = createFakePool(async (text) => {
    if (text.includes("SELECT")) return { rows: [SAMPLE_ROW] };
    return { rows: [] };
  });
  __setRecentSearchesPool(pool);

  const before = Date.now();
  const records = await addRecentSearch(NORMALIZED_ENTRY, 20);

  const upsert = pool.calls.find((c) => c.text.includes("ON CONFLICT (id) DO UPDATE"));
  assert.ok(upsert, "expected an upsert query");
  assert.equal(upsert.params[0], "steam:Neo");
  assert.equal(upsert.params[1], "Neo");
  assert.equal(upsert.params[2], "steam");
  assert.equal(upsert.params[3], "Neo");
  assert.equal(upsert.params[4], null);
  assert.equal(upsert.params[5], null);
  assert.equal(upsert.params[6], null);
  assert.equal(upsert.params[7], 2100, "rating must be rounded to an integer");
  assert.ok(upsert.params[8] >= before, "searched_at must be stamped at write time");

  const trim = pool.calls.find((c) => c.text.includes("DELETE FROM recent_searches"));
  assert.ok(trim, "expected a trim query");
  assert.deepEqual(trim.params, [20]);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, "steam:Neo");
});

test("DB errors are swallowed: get returns [] and add resolves without throwing", async () => {
  __setRecentSearchesPool(createFakePool(async () => {
    throw new Error("connection refused");
  }));

  assert.deepEqual(await getRecentSearches(10), []);
  const result = await addRecentSearch(NORMALIZED_ENTRY, 20);
  assert.deepEqual(result, []);
});

test("table init retries after a failure instead of staying broken", async () => {
  let failCreate = true;
  const pool = createFakePool(async (text) => {
    if (text.includes("CREATE TABLE")) {
      if (failCreate) throw new Error("cold start");
      return { rows: [] };
    }
    if (text.includes("SELECT")) return { rows: [SAMPLE_ROW] };
    return { rows: [] };
  });
  __setRecentSearchesPool(pool);

  assert.deepEqual(await getRecentSearches(10), [], "first call fails via swallowed error");

  failCreate = false;
  const records = await getRecentSearches(10);
  assert.equal(records.length, 1, "second call must retry table init and succeed");

  const creates = pool.calls.filter((c) => c.text.includes("CREATE TABLE"));
  assert.equal(creates.length, 2, "one failed attempt + one successful retry");
});

test("an idle client error is handled instead of taking the process down", async () => {
  const pool = __createRecentSearchesPool();

  try {
    assert.ok(
      pool.listenerCount("error") > 0,
      "the pool needs an 'error' listener — pg-pool emits on it when an idle client dies, and EventEmitter throws an unhandled 'error'"
    );

    // Exactly what pg-pool's makeIdleListener does when Neon drops a suspended
    // connection. Without the listener above this crashes the process.
    assert.doesNotThrow(() => {
      pool.emit("error", new Error("connection terminated unexpectedly"), {});
    });
  } finally {
    await pool.end().catch(() => {});
  }
});

test("the idle timeout closes connections before Neon's autosuspend can drop them", async () => {
  const pool = __createRecentSearchesPool();

  try {
    const idle = pool.options.idleTimeoutMillis;
    assert.ok(
      idle < 5 * 60 * 1000,
      `idleTimeoutMillis (${idle}) must stay under Neon's ~5 min autosuspend so our side closes first`
    );
    assert.ok(
      idle >= 60 * 1000,
      `idleTimeoutMillis (${idle}) must outlive a typical gap between visitors, or every cache miss pays a full reconnect`
    );
  } finally {
    await pool.end().catch(() => {});
  }
});
