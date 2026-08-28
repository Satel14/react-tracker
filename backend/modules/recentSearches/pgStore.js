const { isConfigured, getPool, createPool, __setPool } = require("../db/pool");
const { normalizeRecentEntry } = require("./normalize");

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS recent_searches (
    id            TEXT PRIMARY KEY,
    game_id       TEXT NOT NULL,
    platform      TEXT NOT NULL,
    nickname      TEXT,
    avatar        TEXT,
    rank_icon_url TEXT,
    rank_label    TEXT,
    rating        INTEGER,
    searched_at   BIGINT NOT NULL
  )
`;

const UPSERT_SQL = `
  INSERT INTO recent_searches
    (id, game_id, platform, nickname, avatar, rank_icon_url, rank_label, rating, searched_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (id) DO UPDATE SET
    game_id = EXCLUDED.game_id,
    platform = EXCLUDED.platform,
    nickname = EXCLUDED.nickname,
    avatar = EXCLUDED.avatar,
    rank_icon_url = EXCLUDED.rank_icon_url,
    rank_label = EXCLUDED.rank_label,
    rating = EXCLUDED.rating,
    searched_at = EXCLUDED.searched_at
`;

const TRIM_SQL = `
  DELETE FROM recent_searches
  WHERE id NOT IN (
    SELECT id FROM recent_searches ORDER BY searched_at DESC LIMIT $1
  )
`;

const SELECT_SQL = `
  SELECT id, game_id, platform, nickname, avatar, rank_icon_url, rank_label, rating, searched_at
  FROM recent_searches
  ORDER BY searched_at DESC
  LIMIT $1
`;

let ensureTablePromise = null;

function ensureTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = getPool()
      .query(CREATE_TABLE_SQL)
      .catch((e) => {
        ensureTablePromise = null; // allow the next call to retry
        throw e;
      });
  }
  return ensureTablePromise;
}

function rowToEntry(row = {}) {
  return {
    id: row.id,
    gameId: row.game_id,
    platform: row.platform,
    nickname: row.nickname,
    avatar: row.avatar,
    rankIconUrl: row.rank_icon_url,
    rankLabel: row.rank_label,
    rating: row.rating,
    searchedAt: row.searched_at,
  };
}

async function getRecentSearches(limit) {
  try {
    await ensureTable();
    const safeLimit = Number(limit);
    const effectiveLimit = Number.isFinite(safeLimit) && safeLimit > 0 ? safeLimit : null;
    const { rows } = await getPool().query(SELECT_SQL, [effectiveLimit]);
    return rows.map(rowToEntry).map(normalizeRecentEntry).filter(Boolean);
  } catch (e) {
    console.log(`[RECENT] Postgres read failed: ${e.message}`);
    return [];
  }
}

async function addRecentSearch(normalized, maxItems) {
  try {
    await ensureTable();
    const rating = Number.isFinite(normalized.rating) ? Math.round(normalized.rating) : null;
    await getPool().query(UPSERT_SQL, [
      normalized.id,
      normalized.gameId,
      normalized.platform,
      normalized.nickname,
      normalized.avatar,
      normalized.rankIconUrl,
      normalized.rankLabel,
      rating,
      Date.now(),
    ]);
    await getPool().query(TRIM_SQL, [maxItems]);
    return await getRecentSearches(maxItems);
  } catch (e) {
    console.log(`[RECENT] Postgres write failed: ${e.message}`);
    return [];
  }
}

function __setRecentSearchesPool(nextPool) {
  __setPool(nextPool);
  ensureTablePromise = null;
}

module.exports = {
  isConfigured,
  getRecentSearches,
  addRecentSearch,
  __createRecentSearchesPool: createPool,
  __setRecentSearchesPool,
};
