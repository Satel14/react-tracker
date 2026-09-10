// Copies tier-census windows from one Neon project into another.
//
// Why this exists: on 2026-09-10 the project holding the census ran out of its
// monthly transfer allowance, every Postgres-backed feature went blank, and a
// replacement project took over the same day. The windows collected before the
// outage stay in the old project until its allowance resets on the 1st of the
// month; this moves them into the new one, after which the old project can go.
//
// Run it DRY FIRST -- that is the default, and it reads counts only:
//
//   CENSUS_SOURCE_URL=<old project>  CENSUS_TARGET_URL=<new project> \
//     node scripts/censusMigrate/migrate.js
//
// then, once the plan looks right:
//
//   ... node scripts/censusMigrate/migrate.js --apply
//
// Deliberately NOT reading DATABASE_URL. That variable points at whichever
// database is live, and a script that copies rows between two databases must
// never be one typo away from using the live one as either end by default.
//
// Only `tier_census_observations` is copied, because it is the only table whose
// contents cannot be reproduced: PUBG's /samples endpoint serves recent matches
// only, so a day that was never collected is gone for good. `recent_searches`
// refills itself from live traffic within a day, and `rank_point_snapshots`
// holds readings for a season that has ended -- attribution only ever runs
// against the current one, so copying them would move dead weight.
const { Pool } = require("pg");
const { windowsToCopy, chunk, toColumns, COLUMNS } = require("./plan");

const BATCH_ROWS = 500;

const COUNT_WINDOWS_SQL = `
  SELECT shard, season_id, window_date::text AS window_date, COUNT(*)::int AS count
  FROM tier_census_observations
  GROUP BY shard, season_id, window_date
  ORDER BY window_date
`;

const SELECT_WINDOW_SQL = `
  SELECT ${COLUMNS.map((c) => (c === "window_date" ? "window_date::text AS window_date" : c)).join(", ")}
  FROM tier_census_observations
  WHERE shard = $1 AND season_id = $2 AND window_date = $3::date
  ORDER BY id
`;

// The collector's own insert, verbatim in shape: UNNEST plus the table's
// UNIQUE (shard, season_id, window_date, account_id). That constraint is what
// makes a re-run, or a run resumed after a crash, add nothing twice.
const INSERT_SQL = `
  INSERT INTO tier_census_observations
    (${COLUMNS.join(", ")})
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::date[], $4::text[], $5::text[],
    $6::text[], $7::int[], $8::int[], $9::bigint[]
  )
  ON CONFLICT (shard, season_id, window_date, account_id) DO NOTHING
`;

function requireUrl(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Both ends must be named explicitly.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sourceUrl = requireUrl("CENSUS_SOURCE_URL");
  const targetUrl = requireUrl("CENSUS_TARGET_URL");

  if (sourceUrl === targetUrl) {
    console.error("Source and target are the same database. Refusing.");
    process.exit(1);
  }

  const source = new Pool({ connectionString: sourceUrl, max: 2, connectionTimeoutMillis: 20_000 });
  const target = new Pool({ connectionString: targetUrl, max: 2, connectionTimeoutMillis: 20_000 });

  try {
    const [sourceCounts, targetCounts] = await Promise.all([
      source.query(COUNT_WINDOWS_SQL).then((r) => r.rows),
      target.query(COUNT_WINDOWS_SQL).then((r) => r.rows),
    ]);

    const sourceTotal = sourceCounts.reduce((n, r) => n + Number(r.count), 0);
    const targetTotal = targetCounts.reduce((n, r) => n + Number(r.count), 0);
    console.log(`source: ${sourceCounts.length} windows, ${sourceTotal} rows`);
    console.log(`target: ${targetCounts.length} windows, ${targetTotal} rows`);

    const plan = windowsToCopy(sourceCounts, targetCounts);
    if (!plan.length) {
      console.log("\nNothing to copy: the target already holds every source window in full.");
      return;
    }

    console.log(`\nto copy (${plan.length} windows):`);
    plan.forEach((w) => {
      const already = w.targetRows ? ` (target has ${w.targetRows}, resuming)` : "";
      console.log(`  ${w.windowDate}  ${w.seasonId}  ${w.sourceRows} rows${already}`);
    });

    if (!apply) {
      console.log("\nDry run. Nothing was written. Re-run with --apply to copy.");
      return;
    }

    let copied = 0;
    for (const w of plan) {
      const { rows } = await source.query(SELECT_WINDOW_SQL, [w.shard, w.seasonId, w.windowDate]);
      let inserted = 0;
      for (const batch of chunk(rows, BATCH_ROWS)) {
        const result = await target.query(INSERT_SQL, toColumns(batch));
        inserted += result.rowCount ?? 0;
      }
      copied += inserted;
      const skipped = rows.length - inserted;
      console.log(
        `  ${w.windowDate}  read ${rows.length}, inserted ${inserted}` +
          (skipped ? `, ${skipped} already there` : "")
      );
    }

    // Counted from the target afterwards rather than trusted from the loop: the
    // point of the exercise is what ended up in the new database.
    const after = await target.query(COUNT_WINDOWS_SQL).then((r) => r.rows);
    const afterTotal = after.reduce((n, r) => n + Number(r.count), 0);
    console.log(`\ninserted ${copied} rows; target now holds ${after.length} windows, ${afterTotal} rows`);

    const missing = windowsToCopy(sourceCounts, after);
    if (missing.length) {
      console.log(`\nWARNING: ${missing.length} window(s) still short. Re-run to finish:`);
      missing.forEach((w) => console.log(`  ${w.windowDate}  ${w.targetRows}/${w.sourceRows}`));
      process.exitCode = 1;
    } else {
      console.log("Every source window is present in the target.");
    }
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

// Guarded so the SQL above can be required and checked by a test without the
// script connecting to anything.
if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { COUNT_WINDOWS_SQL, SELECT_WINDOW_SQL, INSERT_SQL, BATCH_ROWS };
