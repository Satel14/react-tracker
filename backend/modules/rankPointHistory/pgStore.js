const { isConfigured, getPool } = require("../db/pool");
const { sameValues } = require("./reading");

const SNAPSHOT_LIMIT = 100;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rank_point_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    shard         TEXT    NOT NULL,
    account_id    TEXT    NOT NULL,
    season_id     TEXT    NOT NULL,
    rank_point    INTEGER,
    rounds_played INTEGER NOT NULL,
    tier          TEXT,
    modes         JSONB   NOT NULL,
    first_seen_at BIGINT  NOT NULL,
    last_seen_at  BIGINT  NOT NULL
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS rank_point_snapshots_key_idx
  ON rank_point_snapshots (shard, account_id, season_id, first_seen_at DESC)
`;

const SELECT_SQL = `
  SELECT id, rank_point, rounds_played, tier, modes, first_seen_at, last_seen_at
  FROM rank_point_snapshots
  WHERE shard = $1 AND account_id = $2 AND season_id = $3
  ORDER BY first_seen_at DESC
  LIMIT $4
`;

const INSERT_SQL = `
  INSERT INTO rank_point_snapshots
    (shard, account_id, season_id, rank_point, rounds_played, tier, modes, first_seen_at, last_seen_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
`;

// GREATEST, not assignment: a reading captured earlier can be written later,
// and attribution measures every interval from last_seen_at, so a rewound value
// makes an interval end before it starts.
const TOUCH_SQL = `
  UPDATE rank_point_snapshots SET last_seen_at = GREATEST(last_seen_at, $2) WHERE id = $1
`;

const TRIM_SQL = `
  DELETE FROM rank_point_snapshots
  WHERE shard = $1 AND account_id = $2 AND season_id = $3
    AND id NOT IN (
      SELECT id FROM rank_point_snapshots
      WHERE shard = $1 AND account_id = $2 AND season_id = $3
      ORDER BY first_seen_at DESC
      LIMIT $4
    )
`;

let ensureTablePromise = null;

function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = getPool()
      .query(CREATE_TABLE_SQL)
      .then(() => getPool().query(CREATE_INDEX_SQL))
      .catch((e) => {
        ensureTablePromise = null;
        throw e;
      });
  }
  return ensureTablePromise;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToSnapshot(row = {}) {
  return {
    id: toNumber(row.id),
    rankPoint: toNumber(row.rank_point),
    roundsPlayed: toNumber(row.rounds_played) ?? 0,
    tier: row.tier ?? null,
    modes: row.modes && typeof row.modes === "object" ? row.modes : {},
    firstSeenAt: toNumber(row.first_seen_at),
    lastSeenAt: toNumber(row.last_seen_at),
  };
}

async function loadSeries({ shard, accountId, seasonId }, limit = SNAPSHOT_LIMIT) {
  await ensureTable();
  const { rows } = await getPool().query(SELECT_SQL, [shard, accountId, seasonId, limit]);
  return rows.map(rowToSnapshot).reverse();
}

async function recordReading({ shard, accountId, seasonId }, reading, { latest = null, now = Date.now() } = {}) {
  try {
    await ensureTable();
    if (latest && latest.id !== null && sameValues(latest, reading)) {
      await getPool().query(TOUCH_SQL, [latest.id, now]);
      return { changed: false };
    }
    await getPool().query(INSERT_SQL, [
      shard,
      accountId,
      seasonId,
      reading.rankPoint,
      reading.roundsPlayed,
      reading.tier ?? null,
      JSON.stringify(reading.modes || {}),
      now,
    ]);
    await getPool().query(TRIM_SQL, [shard, accountId, seasonId, SNAPSHOT_LIMIT]);
    return { changed: true };
  } catch (e) {
    console.log(`[RP] Postgres write failed: ${e.message}`);
    return { changed: false, error: e.message };
  }
}

async function warm() {
  if (!isConfigured()) return;
  try {
    await ensureTable();
  } catch (e) {
    console.log(`[RP] Warmup failed: ${e.message}`);
  }
}

function __resetRankPointStore() {
  ensureTablePromise = null;
}

module.exports = {
  SNAPSHOT_LIMIT,
  isConfigured,
  loadSeries,
  recordReading,
  warm,
  __resetRankPointStore,
};
