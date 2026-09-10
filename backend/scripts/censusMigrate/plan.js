// Deciding what to copy, kept separate from doing it.
//
// Written for one job: on 2026-09-10 the Neon project holding the tier census
// ran out of monthly transfer, a replacement project was created, and the
// windows collected before the outage sit in the old one until its allowance
// resets on the 1st. This moves them across.
//
// The table carries UNIQUE (shard, season_id, window_date, account_id) and the
// collector inserts with ON CONFLICT DO NOTHING, so copying is idempotent by
// construction: a second run, or a run resumed after a failure, inserts nothing
// it already inserted. The window skipping below is therefore an egress saving,
// not a correctness measure -- worth having anyway, since reading rows out of a
// database that just ran out of transfer allowance is the whole problem.

// Column order is load-bearing: it has to match the INSERT in migrate.js, which
// in turn matches the collector's own INSERT in modules/tierCensus/pgStore.js.
const COLUMNS = [
  "shard",
  "season_id",
  "window_date",
  "match_id",
  "account_id",
  "tier",
  "sub_tier",
  "rank_point",
  "observed_at",
];

// `id` is deliberately absent. It is a BIGSERIAL the target generates for
// itself; carrying the source's values across would collide with rows the
// collector has already written into the new project.

function windowKey({ shard, season_id: seasonId, window_date: windowDate }) {
  return [shard, seasonId, windowDate].join("|");
}

// A window the target already holds in full is one we do not need to read.
//
// "In full" means the same row count, not merely "present": a copy interrupted
// half way through a window would otherwise be treated as done. Comparing counts
// makes a resumed run finish the job.
function windowsToCopy(sourceCounts, targetCounts) {
  const have = new Map();
  (targetCounts || []).forEach((row) => have.set(windowKey(row), Number(row.count) || 0));

  return (sourceCounts || [])
    .map((row) => ({
      shard: row.shard,
      seasonId: row.season_id,
      windowDate: String(row.window_date),
      sourceRows: Number(row.count) || 0,
      targetRows: have.get(windowKey(row)) || 0,
    }))
    .filter((w) => w.sourceRows > w.targetRows);
}

function chunk(rows, size) {
  const limit = Number.isFinite(size) && size > 0 ? Math.floor(size) : 500;
  const out = [];
  for (let i = 0; i < (rows || []).length; i += limit) {
    out.push(rows.slice(i, i + limit));
  }
  return out;
}

// One array per column, which is the shape UNNEST wants. A row missing a
// nullable field becomes null rather than undefined: node-postgres sends
// undefined as null anyway, but only after a warning, and being explicit here
// keeps the arrays the same length as each other no matter what the source held.
function toColumns(rows) {
  return COLUMNS.map((column) =>
    (rows || []).map((row) => {
      const value = row?.[column];
      return value === undefined ? null : value;
    })
  );
}

module.exports = { COLUMNS, windowsToCopy, chunk, toColumns, windowKey };
