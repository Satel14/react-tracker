// What the home page shows when Postgres cannot be reached at all.
//
// The store swallows its own errors and answers with an empty list, which the
// page renders as "N/A". On 2026-09-10 that is exactly what it did for days:
// the project's monthly Neon transfer allowance ran out and nothing said so.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const recentSearches = require("./index");
const { recordDbError, __resetDbHealth } = require("../db/health");

const COMMITTED = [
  { id: "steam:Fanom_", gameId: "Fanom_", platform: "steam", nickname: "Fanom_", searchedAt: 1757000000000 },
  { id: "steam:Satel14", gameId: "Satel14", platform: "steam", nickname: "Satel14", searchedAt: 1756999999000 },
];

let filePath = null;

// A pool whose every query rejects the way Neon does when the allowance is gone.
const deadPool = () => ({
  query: async () => {
    throw new Error("Your project has exceeded the data transfer quota.");
  },
});

const livePool = (rows) => ({
  query: async (text) => (/^\s*SELECT/i.test(text) ? { rows } : { rows: [] }),
});

beforeEach(() => {
  __resetDbHealth();
  filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "recent-")), "last-searcheds.json");
  fs.writeFileSync(filePath, JSON.stringify(COMMITTED));
  recentSearches.__setRecentSearchesFile(filePath);
});

afterEach(() => {
  recentSearches.__setRecentSearchesPool(null);
  __resetDbHealth();
});

test("an unreachable Postgres falls back to the committed file", async () => {
  recentSearches.__setRecentSearchesPool(deadPool());

  const list = await recentSearches.getRecentSearches(10);

  assert.equal(list.length, 2, "the block shows names instead of nothing");
  assert.deepEqual(list.map((e) => e.gameId), ["Fanom_", "Satel14"]);
});

// The distinction the whole fallback rests on. A table that is genuinely empty
// is not an outage, and answering it with week-old committed rows would invent
// recent searches that never happened.
test("a genuinely empty table is served as empty", async () => {
  recentSearches.__setRecentSearchesPool(livePool([]));

  const list = await recentSearches.getRecentSearches(10);

  assert.deepEqual(list, [], "no fallback when Postgres answered fine");
});

test("a recovered Postgres stops the fallback", async () => {
  recentSearches.__setRecentSearchesPool(deadPool());
  assert.equal((await recentSearches.getRecentSearches(10)).length, 2);

  recentSearches.__setRecentSearchesPool(
    livePool([
      { id: "steam:Neo", game_id: "Neo", platform: "steam", nickname: "Neo", searched_at: "1757000500000" },
    ]),
  );

  const list = await recentSearches.getRecentSearches(10);
  assert.deepEqual(list.map((e) => e.gameId), ["Neo"], "live rows win the moment they come back");
});

// The flag is about the read that just ran, not about the history of the
// process. An earlier outage must not keep serving committed rows over a
// database that has started answering again -- otherwise the first genuinely
// empty week after any failure would show last month's names for ever.
test("an earlier failure does not keep the fallback switched on", async () => {
  recordDbError("recent-searches", "quota");
  recentSearches.__setRecentSearchesPool(livePool([]));

  const list = await recentSearches.getRecentSearches(10);

  assert.deepEqual(list, [], "the successful read is what counts, and it said empty");
});
