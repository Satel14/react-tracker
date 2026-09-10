const { test } = require("node:test");
const assert = require("node:assert/strict");
const { COLUMNS, windowsToCopy, chunk, toColumns } = require("./plan");

const count = (windowDate, n, over = {}) => ({
  shard: "steam",
  season_id: "division.bro.official.pc-2018-42",
  window_date: windowDate,
  count: n,
  ...over,
});

test("the column list matches the collector's insert, id excluded", () => {
  assert.deepEqual(COLUMNS, [
    "shard", "season_id", "window_date", "match_id", "account_id",
    "tier", "sub_tier", "rank_point", "observed_at",
  ]);
  // The target generates its own BIGSERIAL; carrying the source's ids across
  // would collide with rows the collector already wrote there.
  assert.equal(COLUMNS.includes("id"), false);
});

test("copies the windows the target does not have", () => {
  const plan = windowsToCopy(
    [count("2026-09-01", 2001), count("2026-09-02", 1980)],
    [],
  );
  assert.deepEqual(plan.map((w) => w.windowDate), ["2026-09-01", "2026-09-02"]);
  assert.equal(plan[0].sourceRows, 2001);
  assert.equal(plan[0].targetRows, 0);
});

test("skips a window the target already holds in full", () => {
  const plan = windowsToCopy(
    [count("2026-09-01", 2001), count("2026-09-02", 1980)],
    [count("2026-09-01", 2001)],
  );
  assert.deepEqual(plan.map((w) => w.windowDate), ["2026-09-02"]);
});

// The reason this compares counts instead of mere presence: a copy killed half
// way through a window would look finished, and the rest of that day would be
// lost silently. The UNIQUE constraint makes finishing it free of duplicates.
test("resumes a window that was only partly copied", () => {
  const plan = windowsToCopy([count("2026-09-01", 2001)], [count("2026-09-01", 640)]);
  assert.deepEqual(plan.map((w) => w.windowDate), ["2026-09-01"]);
  assert.equal(plan[0].targetRows, 640);
});

test("a window of another season or shard is a different window", () => {
  const plan = windowsToCopy(
    [count("2026-09-01", 10), count("2026-09-01", 10, { season_id: "pc-2018-43" })],
    [count("2026-09-01", 10)],
  );
  assert.deepEqual(plan.map((w) => w.seasonId), ["pc-2018-43"]);
});

test("nothing to do is an empty plan, not a crash", () => {
  assert.deepEqual(windowsToCopy([], []), []);
  assert.deepEqual(windowsToCopy(null, null), []);
});

test("chunks rows and keeps every one of them", () => {
  const rows = Array.from({ length: 1201 }, (_v, i) => ({ account_id: `a${i}` }));
  const batches = chunk(rows, 500);
  assert.deepEqual(batches.map((b) => b.length), [500, 500, 201]);
  assert.equal(batches.flat().length, 1201);
});

test("a nonsense batch size falls back rather than looping forever", () => {
  assert.equal(chunk([{}, {}], 0).length, 1);
  assert.equal(chunk([{}, {}], -5).length, 1);
});

test("builds one array per column, in column order", () => {
  const columns = toColumns([
    {
      shard: "steam", season_id: "s42", window_date: "2026-09-01", match_id: "m1",
      account_id: "account.a", tier: "gold", sub_tier: 2, rank_point: 2100, observed_at: 1757000000000,
    },
    {
      shard: "steam", season_id: "s42", window_date: "2026-09-01", match_id: "m2",
      account_id: "account.b", tier: null, sub_tier: null, rank_point: null, observed_at: 1757000000001,
    },
  ]);

  assert.equal(columns.length, COLUMNS.length);
  assert.deepEqual(columns[COLUMNS.indexOf("account_id")], ["account.a", "account.b"]);
  assert.deepEqual(columns[COLUMNS.indexOf("tier")], ["gold", null]);
  assert.deepEqual(columns[COLUMNS.indexOf("rank_point")], [2100, null]);
});

// UNNEST needs every array the same length. A source row that somehow lacks a
// column must still contribute a slot, or the columns shear and rows are written
// with another row's values.
test("a missing field becomes null rather than shortening its column", () => {
  const columns = toColumns([
    { shard: "steam", season_id: "s42", window_date: "2026-09-01", match_id: "m1", account_id: "a", observed_at: 1 },
    { shard: "steam", season_id: "s42", window_date: "2026-09-01", match_id: "m2", account_id: "b", observed_at: 2, tier: "gold" },
  ]);

  columns.forEach((column, i) => {
    assert.equal(column.length, 2, `column ${COLUMNS[i]} sheared`);
  });
  assert.deepEqual(columns[COLUMNS.indexOf("tier")], [null, "gold"]);
});

// --- the SQL, checked against the column list it has to agree with ---
//
// A mismatch here is silent until the moment the copy runs, which is once, on a
// date, against a database whose allowance has just reset.
const { INSERT_SQL, SELECT_WINDOW_SQL, COUNT_WINDOWS_SQL } = require("./migrate");

test("the insert has exactly one UNNEST placeholder per column", () => {
  const placeholders = INSERT_SQL.match(/\$\d+::\w+\[\]/g) || [];
  assert.equal(placeholders.length, COLUMNS.length);
  // Numbered 1..N in order, because toColumns returns them in COLUMNS order.
  assert.deepEqual(
    placeholders.map((p) => Number(p.match(/\d+/)[0])),
    COLUMNS.map((_c, i) => i + 1),
  );
});

test("the insert names the same columns, in the same order", () => {
  const named = INSERT_SQL.match(/\(([^)]*)\)\n\s*SELECT \* FROM UNNEST/);
  assert.ok(named, "could not find the column list in the insert");
  assert.deepEqual(named[1].split(",").map((c) => c.trim()), COLUMNS);
});

// Without the cast, node-postgres hands back a JS Date whose toString is
// timezone-shifted, and the window a row belongs to could move by a day.
test("both reads return window_date as text", () => {
  assert.match(SELECT_WINDOW_SQL, /window_date::text AS window_date/);
  assert.match(COUNT_WINDOWS_SQL, /window_date::text AS window_date/);
});

test("the insert leaves rows already present alone", () => {
  assert.match(
    INSERT_SQL,
    /ON CONFLICT \(shard, season_id, window_date, account_id\) DO NOTHING/,
    "this is what makes a re-run safe",
  );
});
