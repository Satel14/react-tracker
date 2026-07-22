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
