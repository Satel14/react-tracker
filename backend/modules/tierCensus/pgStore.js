// Where the tier census accumulates.
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
    observed_at  BIGINT  NOT NULL,
    UNIQUE (shard, season_id, window_date, account_id)
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS tier_census_window_idx
  ON tier_census_observations (shard, season_id, window_date DESC)
`;

// One statement for the whole batch. ON CONFLICT keeps the account's first
// sighting of the day rather than churning the row for every lobby it turns up
// in -- a person who plays twenty games is one account, not twenty.
const INSERT_SQL = `
  INSERT INTO tier_census_observations
    (shard, season_id, window_date, match_id, account_id, tier, sub_tier, rank_point, observed_at)
  SELECT * FROM UNNEST(
    $1::text[], $2::text[], $3::date[], $4::text[], $5::text[],
    $6::text[], $7::int[], $8::int[], $9::bigint[]
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
// Which season the table has most recently heard from. For the first days of a
// new season its own rows only say that nobody has placed yet, so the page
// falls back to the last season that has something to report.
const SELECT_LATEST_SEASON_SQL = `
  SELECT season_id
  FROM tier_census_observations
  WHERE shard = $1
  ORDER BY window_date DESC
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

const SELECT_WINDOW_SQL = `
  SELECT DISTINCT ON (account_id) match_id, tier
  FROM tier_census_observations
  WHERE shard = $1 AND season_id = $2
    AND window_date > (
      SELECT MAX(window_date) FROM tier_census_observations
      WHERE shard = $1 AND season_id = $2
    ) - $3::int
  ORDER BY account_id, window_date DESC
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

const EMPTY_COVERAGE = {
  matches: 0,
  accounts: 0,
  windows: 0,
  firstDate: null,
  lastDate: null,
};

let ensureTablePromise = null;

function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = getPool()
      .query(CREATE_TABLE_SQL)
      .then(() => getPool().query(CREATE_INDEX_SQL))
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
    ];
    const result = await getPool().query(INSERT_SQL, columns);
    return result?.rowCount ?? 0;
  } catch (error) {
    // A census is not worth an outage. Same posture as every other store here.
    console.log(`[census] could not record observations: ${error.message}`);
    return 0;
  }
}

async function readWindow({ shard, seasonId, days }) {
  if (!isConfigured()) return [];
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_WINDOW_SQL, [shard, seasonId, days]);
    return (result?.rows ?? []).map((row) => ({ matchId: row.match_id, tier: row.tier }));
  } catch (error) {
    console.log(`[census] could not read the window: ${error.message}`);
    return [];
  }
}

async function isWindowCollected({ shard, seasonId, windowDate }) {
  if (!isConfigured() || !windowDate) return false;
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_COLLECTED_SQL, [shard, seasonId, windowDate]);
    return Boolean(result?.rows?.[0]?.collected);
  } catch (error) {
    // Fail towards collecting. Reading a day twice costs quota; skipping one we
    // do not have loses it until the window rolls past.
    console.log(`[census] could not check whether ${windowDate} is collected: ${error.message}`);
    return false;
  }
}

async function readLatestSeason({ shard }) {
  if (!isConfigured()) return null;
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_LATEST_SEASON_SQL, [shard]);
    return result?.rows?.[0]?.season_id ?? null;
  } catch (error) {
    console.log(`[census] could not read the latest season: ${error.message}`);
    return null;
  }
}

async function readRankPoints({ shard, seasonId, days }) {
  if (!isConfigured()) return [];
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_RANK_POINTS_SQL, [shard, seasonId, days]);
    return (result?.rows ?? []).map((row) => row.rank_point);
  } catch (error) {
    console.log(`[census] could not read the rank points: ${error.message}`);
    return [];
  }
}

async function readCoverage({ shard, seasonId, days }) {
  if (!isConfigured()) return { ...EMPTY_COVERAGE };
  try {
    await ensureTable();
    const result = await getPool().query(SELECT_COVERAGE_SQL, [shard, seasonId, days]);
    const row = result?.rows?.[0];
    if (!row) return { ...EMPTY_COVERAGE };
    return {
      matches: Number(row.matches) || 0,
      accounts: Number(row.accounts) || 0,
      windows: Number(row.windows) || 0,
      firstDate: row.first_date ?? null,
      lastDate: row.last_date ?? null,
    };
  } catch (error) {
    console.log(`[census] could not read coverage: ${error.message}`);
    return { ...EMPTY_COVERAGE };
  }
}

function __resetTierCensusStore() {
  ensureTablePromise = null;
}

module.exports = {
  recordObservations,
  readWindow,
  readCoverage,
  isWindowCollected,
  readLatestSeason,
  readRankPoints,
  __resetTierCensusStore,
};
