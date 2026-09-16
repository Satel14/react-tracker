const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { __setPool } = require("../db/pool");
const { isDbFailing, recordDbError, __resetDbHealth } = require("../db/health");
const {
  recordObservations,
  readWindow,
  readCoverage,
  isWindowCollected,
  readLatestSeason,
  readRankPoints,
  __resetTierCensusStore,
  MATCH_STAT_COLUMNS,
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
    metricWindows: 0,
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

// CREATE TABLE IF NOT EXISTS is a no-op against a table that already exists,
// so a database created before this column shipped needs its own statement.
test("adds game_mode to a table that predates it", async () => {
  const pool = fakePool();
  __setPool(pool);
  await recordObservations([observation()]);
  const altered = pool.calls.find((c) => /ALTER TABLE tier_census_observations/.test(c.text));
  assert.ok(altered, "expected an ALTER for databases created before game_mode");
  assert.match(altered.text, /ADD COLUMN IF NOT EXISTS game_mode TEXT/);
});

test("writes the game mode it was given", async () => {
  const pool = fakePool();
  __setPool(pool);
  await recordObservations([observation({ gameMode: "squad" })]);
  const insert = pool.calls.find((c) => /INSERT INTO tier_census_observations/.test(c.text));
  assert.match(insert.text, /game_mode/);
  assert.deepEqual(insert.params[9], ["squad"]);
});

test("swallows a storage failure rather than killing the run", async () => {
  __setPool(fakePool(() => { throw new Error("neon is asleep"); }));
  assert.equal(await recordObservations([observation()]), 0);
});

test("reads a window back with the cluster each observation came from", async () => {
  const pool = fakePool((text) =>
    /SELECT/.test(text)
      ? { rows: [{ match_cluster: 1, tier: "gold" }, { match_cluster: 1, tier: "silver" }] }
      : { rows: [] },
  );
  __setPool(pool);
  const rows = await readWindow({ shard: "steam", seasonId: "s42", days: 7 });
  assert.deepEqual(rows, [
    { matchId: 1, tier: "gold", damage: null, kills: null, timeSurvived: null, winPlace: null, rosterCount: null },
    { matchId: 1, tier: "silver", damage: null, kills: null, timeSurvived: null, winPlace: null, rosterCount: null },
  ]);
});

// This read is the heaviest thing the module sends -- one row per sampled
// account, ~12k on a week. Nothing downstream reads the match as an id, so it
// travels as a small number instead of a 36-character UUID.
test("labels the lobby with a number rather than shipping the match id", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readWindow({ shard: "steam", seasonId: "s42", days: 7 });
  const select = pool.calls.find((c) => /DISTINCT ON \(account_id\)/.test(c.text));
  const projection = select.text.trim().split("\n")[0];
  assert.match(projection, /dense_rank\(\) OVER \(ORDER BY match_id\)::int AS match_cluster/);
  assert.doesNotMatch(projection, /,\s*match_id\b/, "and not the raw id beside it");
});

// Pooling days is how the interval gets narrower, and an account seen on two
// days must still count once across the window.
test("dedups an account across the whole window, keeping its latest tier", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readWindow({ shard: "steam", seasonId: "s42", days: 7 });
  const select = pool.calls.find((c) => /SELECT/.test(c.text) && !/information_schema/.test(c.text));
  assert.match(select.text, /DISTINCT ON \(account_id\)/);
  assert.match(select.text, /ORDER BY account_id, window_date DESC/);
});

test("asks only for the days it was told to pool", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);
  await readWindow({ shard: "steam", seasonId: "s42", days: 3 });
  const select = pool.calls.find((c) => /SELECT/.test(c.text) && !/information_schema/.test(c.text));
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
    metricWindows: 0,
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
  const asked = pool.calls.find(
    (c) => /tier_census_observations/.test(c.text) && !/CREATE|ALTER|information_schema/.test(c.text),
  );
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

// --- which season the table actually holds ---
//
// Ranked resets every three months or so. For the first days of a new season
// the current season's rows are a measurement of everybody being unplaced, so
// the page falls back to the last season that has something to say -- and this
// is how it finds it.

test("names the most recent season that has something to say", async () => {
  const pool = fakePool(() => ({ rows: [{ season_id: "division.bro.official.pc-2018-42" }] }));
  __setPool(pool);

  const latest = await readLatestSeason({
    shard: "steam",
    exclude: "division.bro.official.pc-2018-43",
    minWindows: 3,
  });

  assert.equal(latest, "division.bro.official.pc-2018-42");
  const asked = pool.calls.find(
    (call) => /tier_census_observations/.test(call.text) && !/CREATE|ALTER|information_schema/.test(call.text)
  );
  assert.ok(asked, "no question was asked");
  assert.deepEqual(asked.params, ["steam", "division.bro.official.pc-2018-43", 3]);
  assert.match(asked.text, /ORDER BY MAX\(window_date\) DESC/);
});

// The whole point of the fallback is to step off the season being served, and
// on the day a season turns over that season owns the newest row in the table.
// Ordering by window_date alone therefore answered with the very season the
// caller was trying to get away from, and the page published a day of nobody
// having placed yet as if it were the ladder.
test("never names the season it was asked to step off", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);

  await readLatestSeason({
    shard: "steam",
    exclude: "division.bro.official.pc-2018-43",
    minWindows: 3,
  });

  const asked = pool.calls.find(
    (call) => /SELECT/.test(call.text) && !/CREATE|information_schema/.test(call.text),
  );
  assert.match(asked.text, /season_id <> \$2/, "the served season is not excluded in SQL");
});

// A season with one day behind it is exactly what the caller is falling back
// FROM. Handing back another of the same is not an answer.
test("skips a season too thin to stand in for the one being served", async () => {
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);

  await readLatestSeason({ shard: "steam", exclude: "s43", minWindows: 3 });

  const asked = pool.calls.find(
    (call) => /SELECT/.test(call.text) && !/CREATE|information_schema/.test(call.text),
  );
  assert.match(asked.text, /HAVING COUNT\(DISTINCT window_date\) >= \$3/);
});

test("names no season when the table is empty", async () => {
  __setPool(fakePool(() => ({ rows: [] })));
  assert.equal(await readLatestSeason({ shard: "steam" }), null);
});

test("names no season when there is no database", async () => {
  assert.equal(await readLatestSeason({ shard: "steam" }), null);
});

// Serving the current season with a thin sample is a worse failure than
// serving it with a full one, but both beat a 500 on an article.
test("names no season when the query fails", async () => {
  __setPool(fakePool(() => { throw new Error("connection terminated unexpectedly"); }));
  assert.equal(await readLatestSeason({ shard: "steam" }), null);
});

// --- the rank points behind a standing ---
//
// rank_point has been collected since the first run and read by nothing. The
// player page needs it to say where a visitor sits, so this is the one query
// that looks at it.

test("reads one rank point per account over the window", async () => {
  const pool = fakePool(() => ({ rows: [{ rank_point: 2400 }, { rank_point: 1850 }] }));
  __setPool(pool);

  assert.deepEqual(
    await readRankPoints({ shard: "steam", seasonId: "s", days: 7 }),
    [2400, 1850],
  );

  const asked = pool.calls.find(
    (call) => /rank_point/.test(call.text) && !/CREATE|INSERT/.test(call.text)
  );
  assert.ok(asked, "no question was asked");
  assert.deepEqual(asked.params, ["steam", "s", 7]);
  // Same shape as the tier window: one row per account, its most recent
  // reading, counted back from the newest sample held rather than from today.
  assert.match(asked.text, /DISTINCT ON \(account_id\)/);
  assert.match(asked.text, /MAX\(window_date\)/);
});

// A player who has not queued ranked is kept as a row with a null tier, and
// carries no rank point. Those rows must not reach the table -- the caller
// filters too, but a query that hands back nulls invites the mistake.
test("leaves out accounts with no rank point", async () => {
  __setPool(fakePool(() => ({ rows: [{ rank_point: 2400 }] })));
  const pool = fakePool(() => ({ rows: [] }));
  __setPool(pool);

  await readRankPoints({ shard: "steam", seasonId: "s", days: 7 });
  const asked = pool.calls.find(
    (call) => /rank_point/.test(call.text) && !/CREATE|INSERT/.test(call.text)
  );
  assert.match(asked.text, /rank_point IS NOT NULL/);
});

test("reads nothing when there is no database", async () => {
  assert.deepEqual(await readRankPoints({ shard: "steam", seasonId: "s", days: 7 }), []);
});

test("reads nothing when the query fails", async () => {
  __setPool(fakePool(() => { throw new Error("connection terminated unexpectedly"); }));
  assert.deepEqual(await readRankPoints({ shard: "steam", seasonId: "s", days: 7 }), []);
});

// Every read here reports a success; the write only ever reported failures. A
// nightly collection on a day nobody opens /ranks could therefore only push
// /healthz towards "failing" and never clear it again.
test("a successful write clears a failure the same way a read does", async () => {
  __resetDbHealth();
  recordDbError("census", "neon was asleep");
  __setPool(fakePool());

  await recordObservations([observation()]);

  assert.equal(isDbFailing("census"), false, "the write proved the database is answering");
});

// The ALTER is the one statement here that needs ownership of the table, and it
// takes an AccessExclusiveLock even when the column is already there. Chained
// under the shared catch it would take every census read down with it -- and
// make isWindowCollected answer "not collected", re-spending ~1900 metered PUBG
// calls on a day already in the store.
test("a failing ALTER does not take the reads down with it", async () => {
  __setPool(
    fakePool((text) => {
      if (/ALTER TABLE/.test(text)) throw new Error("must be owner of table tier_census_observations");
      if (/SELECT dense_rank/.test(text)) return { rows: [{ match_cluster: 1, tier: "gold" }] };
      return { rows: [] };
    }),
  );

  const rows = await readWindow({ shard: "steam", seasonId: "s", days: 7 });

  assert.deepEqual(rows, [
    { matchId: 1, tier: "gold", damage: null, kills: null, timeSurvived: null, winPlace: null, rosterCount: null },
  ]);
});

test("a failing ALTER still lets a window be recognised as collected", async () => {
  __setPool(
    fakePool((text) => {
      if (/ALTER TABLE/.test(text)) throw new Error("must be owner of table tier_census_observations");
      if (/AS collected/.test(text)) return { rows: [{ collected: true }] };
      return { rows: [] };
    }),
  );

  const collected = await isWindowCollected({ shard: "steam", seasonId: "s", windowDate: "2026-08-30" });

  assert.equal(collected, true, "a day already in the store must not be collected twice");
});

// Add MATCH_STAT_COLUMNS to pgStore's module.exports and to this file's require
// block -- the tests below count against it, and a hand-typed 14 here would go
// stale the first time a column is added.
//
// A fake pool that answers the catalog probe. The plain fakePool() answers every
// query with `{rows: []}`, which the implementation reads as "the columns are
// absent" and correctly falls back to the narrow statements -- so a test of the
// WIDE path that forgets this passes a narrow INSERT and asserts against the
// wrong parameter positions.
const catalogSays = (present) => (text) =>
  text.includes("information_schema.columns") ? { rows: [{ present }] } : { rows: [], rowCount: 1 };

const wholeSchema = () => fakePool(catalogSays(MATCH_STAT_COLUMNS.length));

test("every performance column is written, and an unreported one goes in as null", async () => {
  const pool = wholeSchema();
  __setPool(pool);
  await recordObservations([
    observation({ damageDealt: 217, kills: 3, timeSurvived: 1146, winPlace: 4, rosterCount: 16,
      headshotKills: 1, assists: 2, dbnos: 3, revives: 0, walkDistance: 1820, rideDistance: 640,
      mapName: "Baltic_Main", matchDuration: 1834 }),
    observation({ accountId: `account.${"b".repeat(32)}`, kills: null }),
  ]);

  const insert = pool.calls.find((c) => c.text.includes("INSERT INTO tier_census_observations"));
  assert.ok(insert, "the insert ran");
  // $11 onwards are the performance columns, in the order the SQL lists them.
  assert.deepEqual(insert.params[10], [217, null]);   // damage_dealt
  assert.deepEqual(insert.params[11], [3, null]);     // kills
  assert.deepEqual(insert.params[14], [16, null]);    // roster_count
  assert.deepEqual(insert.params[21], ["Baltic_Main", null]); // map_name
});

// The live table already exists, so CREATE TABLE IF NOT EXISTS is a no-op
// against it and only the ALTER can add these columns.
test("the columns are added in one statement, not fifteen", async () => {
  const pool = wholeSchema();
  __setPool(pool);
  await recordObservations([observation()]);

  const alters = pool.calls.filter((c) => c.text.includes("ADD COLUMN IF NOT EXISTS damage_dealt"));
  assert.equal(alters.length, 1);
  assert.equal(alters[0].text.match(/ADD COLUMN IF NOT EXISTS/g).length, MATCH_STAT_COLUMNS.length);
});

// The case the live database will actually be in from the second boot onward,
// and the one that makes "did the ALTER work" the wrong question: the columns
// are there, and the ALTER still fails because it checks ownership before it
// checks existence. Answering off the ALTER would drop a working schema onto
// the narrow statements for ever.
test("an ALTER that fails over a schema that already has the columns still goes wide", async () => {
  const pool = fakePool((text) => {
    if (text.includes("ADD COLUMN IF NOT EXISTS damage_dealt")) throw new Error("must be owner of table");
    return catalogSays(MATCH_STAT_COLUMNS.length)(text);
  });
  __setPool(pool);

  assert.equal(await recordObservations([observation({ damageDealt: 217 })]), 1);
  const insert = pool.calls.find((c) => c.text.includes("INSERT INTO tier_census_observations"));
  assert.ok(insert.text.includes("damage_dealt"), "the failed ALTER did not decide this");
});

// ADD COLUMN IF NOT EXISTS takes an AccessExclusiveLock even when the column is
// already there, so it can fail where CREATE TABLE IF NOT EXISTS cannot. Under
// the shared catch it once cost every census read and re-spent ~1900 metered
// PUBG calls on a day already stored.
//
// But surviving the ALTER is only half of it. If the columns really are absent,
// a wide INSERT and a wide SELECT both fail against a real database -- which
// would lose the whole night's collection and blank the tier bars on /ranks.
// So the store asks the catalog what it actually has and picks its SQL from the
// answer. These two tests are the pair that proves it.
test("with the columns in place it writes and reads the wide statements", async () => {
  const pool = wholeSchema();
  __setPool(pool);
  assert.equal(await recordObservations([observation({ damageDealt: 217 })]), 1);
  const insert = pool.calls.find((c) => c.text.includes("INSERT INTO tier_census_observations"));
  assert.ok(insert.text.includes("damage_dealt"));
});

test("with the columns missing it falls back rather than losing the night", async () => {
  const pool = fakePool((text) => {
    if (text.includes("ADD COLUMN IF NOT EXISTS damage_dealt")) throw new Error("must be owner");
    return catalogSays(0)(text);
  });
  __setPool(pool);

  // The collection still lands, without the new fields.
  assert.equal(await recordObservations([observation({ damageDealt: 217 })]), 1);
  const insert = pool.calls.find((c) => c.text.includes("INSERT INTO tier_census_observations"));
  assert.ok(!insert.text.includes("damage_dealt"), "fell back to the narrow insert");

  // And the window read still answers, so /ranks keeps its tier bars.
  const rows = await readWindow({ shard: "steam", seasonId: "s", days: 7 });
  assert.deepEqual(rows, []);
  const select = pool.calls.find((c) => c.text.includes("dense_rank()"));
  assert.ok(!select.text.includes("damage_dealt"), "fell back to the narrow window read");
});

// information_schema.columns is instance-wide: without a schema filter, a
// same-named table sitting in another schema could make the count come back
// wrong and silently force the narrow statements on a database that actually
// has the columns -- with one log line as the only clue the feature never
// started collecting.
test("the column probe is scoped to the current schema, not just the table name", async () => {
  const pool = wholeSchema();
  __setPool(pool);
  await recordObservations([observation()]);

  const probe = pool.calls.find((c) => c.text.includes("information_schema.columns"));
  assert.ok(probe, "the catalog was queried");
  assert.match(probe.text, /table_schema\s*=\s*current_schema\(\)/);
});

// windows counts days the census collected, which says nothing about whether
// any of them carry a benchmark. Publishing a one-day reading is the defect
// PR #88 fixed for the tier shares.
test("coverage reports how many windows carry the new columns", async () => {
  const pool = fakePool((text) =>
    text.includes("information_schema.columns")
      ? { rows: [{ present: MATCH_STAT_COLUMNS.length }] }
      : { rows: [{ matches: 600, accounts: 9000, windows: 7, metric_windows: 2,
          first_date: "2026-09-08", last_date: "2026-09-14" }] },
  );
  __setPool(pool);
  const coverage = await readCoverage({ shard: "steam", seasonId: "s", days: 7 });
  assert.equal(coverage.windows, 7);
  assert.equal(coverage.metricWindows, 2);
});

test("coverage reports no metric windows when the columns are absent", async () => {
  const pool = fakePool((text) =>
    text.includes("information_schema.columns")
      ? { rows: [{ present: 0 }] }
      : { rows: [{ matches: 600, accounts: 9000, windows: 7,
          first_date: "2026-09-08", last_date: "2026-09-14" }] },
  );
  __setPool(pool);
  assert.equal((await readCoverage({ shard: "steam", seasonId: "s", days: 7 })).metricWindows, 0);
});

// The catalog answer is load-bearing in this test, not scenery. With an empty
// one the implementation correctly picks the NARROW select -- and a mock that
// hands back metric columns to any dense_rank() query answers it anyway, so the
// assertion on the mapped row passes while the statement under test never ran.
// Assert on the SQL as well as on the mapping.
test("the window read hands back the performance beside the tier", async () => {
  const pool = fakePool((text) => {
    if (text.includes("information_schema.columns")) return { rows: [{ present: MATCH_STAT_COLUMNS.length }] };
    return text.includes("dense_rank()")
      ? { rows: [{ match_cluster: 1, tier: "gold", damage_dealt: 217, kills: 3,
          time_survived: 1146, win_place: 4, roster_count: 16 }] }
      : { rows: [] };
  });
  __setPool(pool);
  const rows = await readWindow({ shard: "steam", seasonId: "s", days: 7 });

  const select = pool.calls.find((c) => c.text.includes("dense_rank()"));
  assert.ok(select.text.includes("damage_dealt"), "the wide window read is the one that ran");
  assert.deepEqual(rows, [{ matchId: 1, tier: "gold", damage: 217, kills: 3,
    timeSurvived: 1146, winPlace: 4, rosterCount: 16 }]);
});
