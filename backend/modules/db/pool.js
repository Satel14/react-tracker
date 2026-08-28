const { Pool } = require("pg");

let pool = null;
let poolOverride = null;

function isConfigured() {
  return Boolean(poolOverride || process.env.DATABASE_URL);
}

function createPool() {
  const nextPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    // Neon autosuspends after ~5 min idle and drops connections; close ours first,
    // but outlive the usual gap between visitors (30s meant a reconnect per miss).
    idleTimeoutMillis: 180_000,
    connectionTimeoutMillis: 10_000,
  });

  // pg-pool emits 'error' when an idle client dies; unhandled, EventEmitter throws.
  nextPool.on("error", (e) => {
    console.log(`[DB] Idle Postgres client dropped: ${e.message}`);
  });

  return nextPool;
}

function getPool() {
  if (poolOverride) return poolOverride;
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

// Test seam shared by every store: a non-null pool forces the Postgres path.
function __setPool(nextPool) {
  poolOverride = nextPool || null;
}

module.exports = {
  isConfigured,
  getPool,
  createPool,
  __setPool,
};
