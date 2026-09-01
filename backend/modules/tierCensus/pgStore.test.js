const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { __setPool } = require("../db/pool");
const {
  recordObservations,
  readWindow,
  readCoverage,
  isWindowCollected,
  __resetTierCensusStore,
} = require("./pgStore");

afterEach(() => {
  __setPool(null);
  __resetTierCensusStore();
});

const fakePool = (handler = () => ({ rows: [] })) => {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return handler(text, params) ?? { rows: [] };
    },
  };
};

const observation = (over = {}) => ({
  shard: "steam",
  seasonId: "division.bro.official.pc-2018-42",
  windowDate: "2026-08-30",
  matchId: "m1",
  accountId: `account.${"a".repeat(32)}`,
  tier: "gold",
  subTier: 2,
  rankPoint: 2160,
  observedAt: 1788200000000,
  ...over,
});

// Every other store in this codebase keeps working when DATABASE_URL is unset.
// A census that threw on a machine without a database would take the whole
// backend down with it.
test("does nothing and reports nothing when there is no database", async () => {
  assert.equal(await recordObservations([observation()]), 0);
  assert.deepEqual(await readWindow({ shard: "steam", seasonId: "s", days: 7 }), []);
  assert.deepEqual(await readCoverage({ shard: "steam", seasonId: "s", days: 7 }), {
    matches: 0,
    accounts: 0,
    windows: 0,
    firstDate: null,
    lastDate: null,
  });
});

test("creates its table before the first write", async () => {
  const pool = fakePool();
  __setPool(pool);
  await recordObservations([observation()]);
  assert.match(pool.calls[0].text, /CREATE TABLE IF NOT EXISTS tier_census_observations/);
});

test("writes one row per observation", async () => {
  const pool = fakePool((text) => ({ rowCount: /INSERT/.test(text) ? 2 : 0, rows: [] }));
  __setPool(pool);
  const written = await recordObservations([observation(), observation({ accountId: `account.${"b".repeat(32)}` })]);
  assert.equal(written, 2);
  const insert = pool.calls.find((c) => /INSERT INTO tier_census_observations/.test(c.text));
  assert.ok(insert, "no insert was issued");
});

// The same account turns up in several lobbies a day. Counting it twice would
// weight the distribution by how much a person plays, which is a different
// statistic from the one the page claims to publish.
test("keeps one row per account per day", async () => {
  const pool = fakePool();
  __setPool(pool);
  await recordObservations([observation()]);
  const insert = pool.calls.find((c) => /INSERT INTO tier_census_observations/.test(c.text));
  assert.match(insert.text, /ON CONFLICT/);
  assert.match(insert.text, /shard, season_id, window_date, account_id/);
});

test("swallows a storage failure rather than killing the run", async () => {
  __setPool(fakePool(() => { throw new Error("neon is asleep"); }));
  assert.equal(await recordObservations([observation()]), 0);
});

test("reads a window back with the cluster each observation came from", async () => {
  const pool = fakePool((text) =>
    /SELECT/.test(text)
      ? { rows: [{ match_id: "m1", tier: "gold" }, { match_id: "m1", tier: "silver" }] }
      : { rows: [] },
  );
  __setPool(pool);
  const rows = await readWindow({ shard: "steam", seasonId: "s42", days: 7 });
  assert.deepEqual(rows, [
    { matchId: "m1", tier: "gold" },
    { matchId: "m1", tier: "silver" },
  ]);
});

// Pooling days is how the interval gets narrower, and an account seen on two
// days must still count once across the window.
test("dedups an account across the whole window, keeping its latest tier", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readWindow({ shard: "steam", seasonId: "s42", days: 7 });
  const select = pool.calls.find((c) => /SELECT/.test(c.text));
  assert.match(select.text, /DISTINCT ON \(account_id\)/);
  assert.match(select.text, /ORDER BY account_id, window_date DESC/);
});

test("asks only for the days it was told to pool", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readWindow({ shard: "steam", seasonId: "s42", days: 3 });
  const select = pool.calls.find((c) => /SELECT/.test(c.text));
  assert.ok(select.params.includes(3), `days not passed as a parameter: ${select.params}`);
});

// The page has to show what it measured, not just the result. Without these the
// methodology paragraph would be prose with no numbers behind it.
test("reports coverage: clusters, accounts and the real date range", async () => {
  const pool = fakePool((text) =>
    /count/i.test(text)
      ? { rows: [{ matches: "126", accounts: "1873", windows: "7", first_date: "2026-08-24", last_date: "2026-08-30" }] }
      : { rows: [] },
  );
  __setPool(pool);
  const coverage = await readCoverage({ shard: "steam", seasonId: "s42", days: 7 });
  assert.deepEqual(coverage, {
    matches: 126,
    accounts: 1873,
    windows: 7,
    firstDate: "2026-08-24",
    lastDate: "2026-08-30",
  });
});

test("coverage survives a window with nothing in it", async () => {
  __setPool(fakePool(() => ({ rows: [] })));
  const coverage = await readCoverage({ shard: "steam", seasonId: "s42", days: 7 });
  assert.equal(coverage.matches, 0);
  assert.equal(coverage.firstDate, null);
});

// PUBG's sample lags a day and a scheduled run can be missed, so counting the
// window back from today would return six days when asked for seven -- and that
// number is printed on the page as part of its methodology.
test("measures the window back from the newest sample, not from today", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readWindow({ shard: "steam", seasonId: "s42", days: 7 });
  const select = pool.calls.find((c) => /SELECT DISTINCT ON/.test(c.text));
  assert.doesNotMatch(select.text, /CURRENT_DATE/);
  assert.match(select.text, /SELECT MAX\(window_date\)/);
});

test("coverage uses the same window rule as the data it describes", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readCoverage({ shard: "steam", seasonId: "s42", days: 7 });
  const select = pool.calls.find((c) => /COUNT\(DISTINCT match_id\)/.test(c.text));
  assert.doesNotMatch(select.text, /CURRENT_DATE/);
  assert.match(select.text, /SELECT MAX\(window_date\)/);
});

// --- has this day already been collected? ---
//
// A run over a day already in the table can only add players from lobbies it
// already drew. The guard is what turns that hour of quota into a fresh day.

test("reports a window that already has rows as collected", async () => {
  const pool = fakePool(() => ({ rows: [{ collected: true }] }));
  __setPool(pool);

  assert.equal(
    await isWindowCollected({ shard: "steam", seasonId: "s", windowDate: "2026-08-30" }),
    true,
  );
  const asked = pool.calls.find((c) => /tier_census_observations/.test(c.text) && !/CREATE/.test(c.text));
  assert.ok(asked, "no question was asked");
  assert.deepEqual(asked.params, ["steam", "s", "2026-08-30"]);
});

test("reports an untouched window as not collected", async () => {
  __setPool(fakePool(() => ({ rows: [{ collected: false }] })));
  assert.equal(
    await isWindowCollected({ shard: "steam", seasonId: "s", windowDate: "2026-09-01" }),
    false,
  );
});

// Every path here fails towards collecting. Reading a day twice costs quota;
// skipping a day we do not have loses it until the window rolls past.
test("reports nothing collected when there is no database", async () => {
  assert.equal(
    await isWindowCollected({ shard: "steam", seasonId: "s", windowDate: "2026-08-30" }),
    false,
  );
});

test("reports nothing collected when the query fails", async () => {
  __setPool(fakePool(() => { throw new Error("connection terminated unexpectedly"); }));
  assert.equal(
    await isWindowCollected({ shard: "steam", seasonId: "s", windowDate: "2026-08-30" }),
    false,
  );
});
