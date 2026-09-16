// Where the tier census accumulates.
const { recordDbError, recordDbOk } = require("../db/health");
//
// One row per account per sample day, carrying the match it was drawn from --
// the match id is not decoration, it is the cluster the confidence interval is
// computed over. Without it the published interval would silently assume every
// observation is independent, which they are not.
//
// Follows the two stores beside it: lazy CREATE TABLE IF NOT EXISTS, epoch
// milliseconds in BIGINT, and it degrades to a no-op when DATABASE_URL is unset
// rather than taking the backend down with it.

const { isConfigured, getPool } = require("../db/pool");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tier_census_observations (
    id           BIGSERIAL PRIMARY KEY,
    shard        TEXT    NOT NULL,
    season_id    TEXT    NOT NULL,
    window_date  DATE    NOT NULL,
    match_id     TEXT    NOT NULL,
    account_id   TEXT    NOT NULL,
    tier         TEXT,
    sub_tier     INTEGER,
    rank_point   INTEGER,
    game_mode    TEXT,
    damage_dealt   INTEGER,
    kills          SMALLINT,
    time_survived  INTEGER,
    win_place      SMALLINT,
    roster_count   SMALLINT,
    headshot_kills SMALLINT,
    assists        SMALLINT,
    dbnos          SMALLINT,
    revives        SMALLINT,
    walk_distance  INTEGER,
    ride_distance  INTEGER,
    map_name       TEXT,
    match_duration INTEGER,
    tier_mode      TEXT,
    tier_mode_conflict BOOLEAN,
    observed_at  BIGINT  NOT NULL,
    UNIQUE (shard, season_id, window_date, account_id)
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS tier_census_window_idx
  ON tier_census_observations (shard, season_id, window_date DESC)
`;

// CREATE TABLE IF NOT EXISTS is a no-op against a table that already exists, so
// the live database would never gain this column from the DDL above. Recorded
// from 2026-09-14 onward only: a window already collected cannot be told which
// mode it was, and PUBG's /samples serves recent matches only.
const ADD_GAME_MODE_SQL = `
  ALTER TABLE tier_census_observations
  ADD COLUMN IF NOT EXISTS game_mode TEXT
`;

// One statement, fifteen columns. Fifteen statements would be fifteen
// AccessExclusiveLocks on every boot; this is one. No DEFAULT, so Postgres
// records it in the catalog and never rewrites the table.
//
// Five of these are read by the window query. The rest are written and never
// selected: /samples serves only recent days, so a column not collected today
// can never be backfilled, while what Neon meters is transfer.
const MATCH_STAT_COLUMNS = [
  "damage_dealt", "kills", "time_survived", "win_place", "roster_count",
  "headshot_kills", "assists", "dbnos", "revives", "walk_distance",
  "ride_distance", "map_name", "match_duration", "tier_mode", "tier_mode_conflict",
];

const ADD_MATCH_STATS_SQL = `
  ALTER TABLE tier_census_observations
    ADD COLUMN IF NOT EXISTS damage_dealt   INTEGER,
    ADD COLUMN IF NOT EXISTS kills          SMALLINT,
    ADD COLUMN IF NOT EXISTS time_survived  INTEGER,
    ADD COLUMN IF NOT EXISTS win_place      SMALLINT,
    ADD COLUMN IF NOT EXISTS roster_count   SMALLINT,
    ADD COLUMN IF NOT EXISTS headshot_kills SMALLINT,
    ADD COLUMN IF NOT EXISTS assists        SMALLINT,
    ADD COLUMN IF NOT EXISTS dbnos          SMALLINT,
    ADD COLUMN IF NOT EXISTS revives        SMALLINT,
    ADD COLUMN IF NOT EXISTS walk_distance  INTEGER,
    ADD COLUMN IF NOT EXISTS ride_distance  INTEGER,
    ADD COLUMN IF NOT EXISTS map_name       TEXT,
    ADD COLUMN IF NOT EXISTS match_duration INTEGER,
    ADD COLUMN IF NOT EXISTS tier_mode      TEXT,
    ADD COLUMN IF NOT EXISTS tier_mode_conflict BOOLEAN
`;

// Whether the ALTER worked is the wrong question -- it can fail on ownership
// against a table that already has the columns, and it can be skipped entirely
// on a replica. The right question is what the table actually has, and only the
// catalog answers that. One row, once per process.
//
// It is load-bearing rather than defensive. Without it, an ALTER that did not
// run leaves every wide INSERT and every wide SELECT failing against the real
// database: the night's collection is lost and /ranks loses its tier bars,
// which is far worse than shipping without a new page.
// Scoped to the current schema as well as the table name: information_schema
// is instance-wide, so a same-named table sitting in another schema (a stray
// "public" vs "tier_census" mismatch, a leftover from a restore) would let the
// count come back wrong -- too high if that other table happens to share some
// column names, too low otherwise -- and either way this probe would silently
// pick the wrong statements with nothing but a log line to say so.
const COLUMNS_PRESENT_SQL = `
  SELECT COUNT(*)::int AS present
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'tier_census_observations'
    AND column_name = ANY($1::text[])
`;

// One statement for the whole batch. ON CONFLICT keeps the account's first
// sighting of the day rather than churning the row for every lobby it turns up
// in -- a person who plays twenty games is one account, not twenty.
const INSERT_NARROW_SQL = `
  INSERT INTO tier_census_observations
    (shard, season_id, window_date, match_id, account_id, tier, sub_tier, rank_point, observed_at, game_mode)
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::date[], $4::text[], $5::text[],
    $6::text[], $7::int[], $8::int[], $9::bigint[], $10::text[]
  )
  ON CONFLICT (shard, season_id, window_date, account_id) DO NOTHING
`;

const INSERT_WIDE_SQL = `
  INSERT INTO tier_census_observations
    (shard, season_id, window_date, match_id, account_id, tier, sub_tier, rank_point, observed_at, game_mode,
     damage_dealt, kills, time_survived, win_place, roster_count,
     headshot_kills, assists, dbnos, revives, walk_distance, ride_distance, map_name, match_duration,
     tier_mode, tier_mode_conflict)
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::date[], $4::text[], $5::text[],
    $6::text[], $7::int[], $8::int[], $9::bigint[], $10::text[],
    $11::int[], $12::int[], $13::int[], $14::int[], $15::int[],
    $16::int[], $17::int[], $18::int[], $19::int[], $20::int[], $21::int[], $22::text[], $23::int[],
    $24::text[], $25::boolean[]
  )
  ON CONFLICT (shard, season_id, window_date, account_id) DO NOTHING
`;

// DISTINCT ON collapses an account seen on several days in the window down to
// its most recent tier, so pooling days narrows the interval without counting
// anyone twice.
//
// The window is measured back from the newest sample we hold, not from today.
// PUBG's sample lags a day and a run can be missed, so counting back from
// CURRENT_DATE would quietly return six days of data when asked for seven --
// and the page prints that number as part of its methodology.
// The most recent season that can stand in for the one being served. For the
// first days of a new season its own rows only say that nobody has placed yet,
// so the page falls back to the last season with something to report.
//
// Both conditions are load-bearing. Ordering by window_date alone named the
// season with the newest row, which on a rollover day is the new season itself
// -- the very one the caller is stepping off -- so the fallback could never
// fire. And a candidate with a day or two behind it is no better than what it
// would replace, which is why it has to clear the same bar.
const SELECT_LATEST_SEASON_SQL = `
  SELECT season_id
  FROM tier_census_observations
  WHERE shard = $1 AND season_id <> $2
  GROUP BY season_id
  HAVING COUNT(DISTINCT window_date) >= $3
  ORDER BY MAX(window_date) DESC
  LIMIT 1
`;

// Cheap enough to run before every collection: EXISTS stops at the first row
// and the window index already leads with (shard, season_id, window_date).
const SELECT_COLLECTED_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM tier_census_observations
    WHERE shard = $1 AND season_id = $2 AND window_date = $3
  ) AS collected
`;

// The rank points behind a standing. Same shape as the tier window -- one row
// per account, its most recent reading, counted back from the newest sample
// held -- but it drops the accounts that have no rank point rather than hand
// back nulls for the caller to remember to filter.
const SELECT_RANK_POINTS_SQL = `
  SELECT DISTINCT ON (account_id) rank_point
  FROM tier_census_observations
  WHERE shard = $1 AND season_id = $2
    AND rank_point IS NOT NULL
    AND window_date > (
      SELECT MAX(window_date) FROM tier_census_observations
      WHERE shard = $1 AND season_id = $2
    ) - $3::int
  ORDER BY account_id, window_date DESC
`;

// One row per sampled account, and the heaviest thing this file sends: ~12k rows
// on a seven-day window.
//
// The match is returned as a small number rather than its 36-character id
// because nothing downstream reads it as an id -- estimateIcc uses it only to
// tell which observations shared a lobby, so any stable label per match does the
// job. At ~12k rows that is roughly 400 KB of Neon transfer saved per call,
// which stopped being academic on 2026-09-10 when the monthly allowance ran out.
// dense_rank starts at 1, so the label is never falsy.
//
// The match_cluster labels here are NOT complete lobby rosters: the DISTINCT ON
// keeps one day per account, so an account seen twice in a window appears only
// in its latest lobby. estimateIcc only needs to know which observations shared
// a lobby, so that is fine for it; lobbyMix reads the same rows pairwise and
// documents what the thinning costs it.
const SELECT_WINDOW_NARROW_SQL = `
  SELECT dense_rank() OVER (ORDER BY match_id)::int AS match_cluster, tier
  FROM (
    SELECT DISTINCT ON (account_id) match_id, tier
    FROM tier_census_observations
    WHERE shard = $1 AND season_id = $2
      AND window_date > (
        SELECT MAX(window_date) FROM tier_census_observations
        WHERE shard = $1 AND season_id = $2
      ) - $3::int
    ORDER BY account_id, window_date DESC
  ) sampled
`;

const SELECT_WINDOW_WIDE_SQL = `
  SELECT dense_rank() OVER (ORDER BY match_id)::int AS match_cluster,
         tier, damage_dealt, kills, time_survived, win_place, roster_count
  FROM (
    SELECT DISTINCT ON (account_id)
           match_id, tier, damage_dealt, kills, time_survived, win_place, roster_count
    FROM tier_census_observations
    WHERE shard = $1 AND season_id = $2
      AND window_date > (
        SELECT MAX(window_date) FROM tier_census_observations
        WHERE shard = $1 AND season_id = $2
      ) - $3::int
    ORDER BY account_id, window_date DESC
  ) sampled
`;

const SELECT_COVERAGE_SQL = `
  SELECT
    COUNT(DISTINCT match_id)   AS matches,
    COUNT(DISTINCT account_id) AS accounts,
    COUNT(DISTINCT window_date) AS windows,
    MIN(window_date)::text     AS first_date,
    MAX(window_date)::text     AS last_date
  FROM tier_census_observations
  WHERE shard = $1 AND season_id = $2
    AND window_date > (
      SELECT MAX(window_date) FROM tier_census_observations
      WHERE shard = $1 AND season_id = $2
    ) - $3::int
`;

// Adds one aggregate to a query that already returns exactly one row, so it is
// free. windows counts days the census collected; metric_windows counts how many
// of those days actually carry the new performance columns.
const SELECT_COVERAGE_WIDE_SQL = SELECT_COVERAGE_SQL.replace(
  "COUNT(DISTINCT window_date) AS windows,",
  `COUNT(DISTINCT window_date) AS windows,
     COUNT(DISTINCT window_date) FILTER (WHERE damage_dealt IS NOT NULL) AS metric_windows,`,
);

const EMPTY_COVERAGE = {
  matches: 0,
  accounts: 0,
  windows: 0,
  metricWindows: 0,
  firstDate: null,
  lastDate: null,
};

let ensureTablePromise = null;
let hasMatchStats = false;

function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = getPool()
      .query(CREATE_TABLE_SQL)
      .then(() => getPool().query(CREATE_INDEX_SQL))
      // Its own catch, and deliberately a silent one. Unlike CREATE TABLE IF NOT
      // EXISTS, which short-circuits on an existing relation, ADD COLUMN IF NOT
      // EXISTS checks ownership first and takes an AccessExclusiveLock even when
      // the column is already there -- so it can fail where the two statements
      // above cannot. What it costs when it does is one column on a legacy
      // table; chained under the shared catch it cost every census read, and
      // made isWindowCollected answer "not collected" and re-spend ~1900
      // metered PUBG calls on a day already in the store.
      .then(() =>
        getPool()
          .query(ADD_GAME_MODE_SQL)
          .catch((error) => {
            console.log(`[census] game_mode column unavailable: ${error.message}`);
          }),
      )
      // Same reasoning, one statement for all fifteen match-stat columns.
      .then(() =>
        getPool()
          .query(ADD_MATCH_STATS_SQL)
          .catch((error) => {
            console.log(`[census] could not add the match stat columns: ${error.message}`);
          }),
      )
      // Asked whatever the ALTER did, because the ALTER's outcome is not the
      // question -- what the table has is. Its own catch too: a catalog we
      // cannot read means we assume the columns are absent and keep working.
      .then(() =>
        getPool()
          .query(COLUMNS_PRESENT_SQL, [MATCH_STAT_COLUMNS])
          .then((result) => {
            hasMatchStats = Number(result?.rows?.[0]?.present) === MATCH_STAT_COLUMNS.length;
            if (!hasMatchStats) console.log("[census] match stat columns absent; using the narrow statements");
          })
          .catch((error) => {
            hasMatchStats = false;
            console.log(`[census] could not read the column catalog: ${error.message}`);
          }),
      )
      .catch((error) => {
        ensureTablePromise = null;
        throw error;
      });
  }
  return ensureTablePromise;
}

async function recordObservations(observations) {
  const rows = observations ?? [];
  if (!isConfigured() || !rows.length) return 0;

  try {
    await ensureTable();
    const columns = [
      rows.map((r) => r.shard),
      rows.map((r) => r.seasonId),
      rows.map((r) => r.windowDate),
      rows.map((r) => r.matchId),
      rows.map((r) => r.accountId),
      rows.map((r) => r.tier ?? null),
      rows.map((r) => (Number.isFinite(r.subTier) ? r.subTier : null)),
      rows.map((r) => (Number.isFinite(r.rankPoint) ? r.rankPoint : null)),
      rows.map((r) => r.observedAt),
      rows.map((r) => r.gameMode ?? null),
    ];
    if (hasMatchStats) {
      columns.push(
        rows.map((r) => (Number.isFinite(r.damageDealt) ? r.damageDealt : null)),
        rows.map((r) => (Number.isFinite(r.kills) ? r.kills : null)),
        rows.map((r) => (Number.isFinite(r.timeSurvived) ? r.timeSurvived : null)),
        rows.map((r) => (Number.isFinite(r.winPlace) ? r.winPlace : null)),
        rows.map((r) => (Number.isFinite(r.rosterCount) ? r.rosterCount : null)),
        rows.map((r) => (Number.isFinite(r.headshotKills) ? r.headshotKills : null)),
        rows.map((r) => (Number.isFinite(r.assists) ? r.assists : null)),
        rows.map((r) => (Number.isFinite(r.dbnos) ? r.dbnos : null)),
        rows.map((r) => (Number.isFinite(r.revives) ? r.revives : null)),
        rows.map((r) => (Number.isFinite(r.walkDistance) ? r.walkDistance : null)),
        rows.map((r) => (Number.isFinite(r.rideDistance) ? r.rideDistance : null)),
        rows.map((r) => r.mapName ?? null),
        rows.map((r) => (Number.isFinite(r.matchDuration) ? r.matchDuration : null)),
        rows.map((r) => r.tierMode ?? null),
        rows.map((r) => (typeof r.tierModeConflict === "boolean" ? r.tierModeConflict : null)),
      );
    }
    const result = await getPool().query(hasMatchStats ? INSERT_WIDE_SQL : INSERT_NARROW_SQL, columns);
    // A write proves the database is answering just as well as a read does, and
    // a collection can run on a day nobody opens /ranks -- without this the run
    // could only ever push /healthz towards "failing" and never clear it.
    recordDbOk("census");
    return result?.rowCount ?? 0;
  } catch (error) {
    // A census is not worth an outage. Same posture as every other store here.
    console.log(`[census] could not record observations: ${error.message}`);
    recordDbError("census", error.message);
    return 0;
  }
}

async function readWindow({ shard, seasonId, days }) {
  if (!isConfigured()) return [];
  try {
    await ensureTable();
    const result = await getPool().query(
      hasMatchStats ? SELECT_WINDOW_WIDE_SQL : SELECT_WINDOW_NARROW_SQL,
      [shard, seasonId, days],
    );
    recordDbOk("census");
    return (result?.rows ?? []).map((row) => ({
      matchId: row.match_cluster,
      tier: row.tier,
      damage: row.damage_dealt ?? null,
      kills: row.kills ?? null,
      timeSurvived: row.time_survived ?? null,
      winPlace: row.win_place ?? null,
      rosterCount: row.roster_count ?? null,
    }));
  } catch (error) {
    console.log(`[census] could not read the window: ${error.message}`);
    recordDbError("census", error.message);
    return [];
  }
}

async function isWindowCollected({ shard, seasonId, windowDate }) {
  if (!isConfigured() || !windowDate) return false;
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_COLLECTED_SQL, [shard, seasonId, windowDate]);
    recordDbOk("census");
    return Boolean(result?.rows?.[0]?.collected);
  } catch (error) {
    // Fail towards collecting. Reading a day twice costs quota; skipping one we
    // do not have loses it until the window rolls past.
    console.log(`[census] could not check whether ${windowDate} is collected: ${error.message}`);
    recordDbError("census", error.message);
    return false;
  }
}

async function readLatestSeason({ shard, exclude = "", minWindows = 1 }) {
  if (!isConfigured()) return null;
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_LATEST_SEASON_SQL, [shard, exclude, minWindows]);
    recordDbOk("census");
    return result?.rows?.[0]?.season_id ?? null;
  } catch (error) {
    console.log(`[census] could not read the latest season: ${error.message}`);
    recordDbError("census", error.message);
    return null;
  }
}

async function readRankPoints({ shard, seasonId, days }) {
  if (!isConfigured()) return [];
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_RANK_POINTS_SQL, [shard, seasonId, days]);
    recordDbOk("census");
    return (result?.rows ?? []).map((row) => row.rank_point);
  } catch (error) {
    console.log(`[census] could not read the rank points: ${error.message}`);
    recordDbError("census", error.message);
    return [];
  }
}

async function readCoverage({ shard, seasonId, days }) {
  if (!isConfigured()) return { ...EMPTY_COVERAGE };
  try {
    await ensureTable();
    const result = await getPool().query(
      hasMatchStats ? SELECT_COVERAGE_WIDE_SQL : SELECT_COVERAGE_SQL,
      [shard, seasonId, days],
    );
    recordDbOk("census");
    const row = result?.rows?.[0];
    if (!row) return { ...EMPTY_COVERAGE };
    return {
      matches: Number(row.matches) || 0,
      accounts: Number(row.accounts) || 0,
      windows: Number(row.windows) || 0,
      metricWindows: Number(row.metric_windows) || 0,
      firstDate: row.first_date ?? null,
      lastDate: row.last_date ?? null,
    };
  } catch (error) {
    console.log(`[census] could not read coverage: ${error.message}`);
    recordDbError("census", error.message);
    return { ...EMPTY_COVERAGE };
  }
}

function __resetTierCensusStore() {
  ensureTablePromise = null;
  hasMatchStats = false;
}

module.exports = {
  recordObservations,
  readWindow,
  readCoverage,
  isWindowCollected,
  readLatestSeason,
  readRankPoints,
  __resetTierCensusStore,
  MATCH_STAT_COLUMNS,
};
