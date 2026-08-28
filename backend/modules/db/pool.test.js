const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { isConfigured, getPool, createPool, __setPool } = require("./pool");

afterEach(() => {
  __setPool(null);
});

function withEnv(value, fn) {
  const saved = process.env.DATABASE_URL;
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
}

test("isConfigured reflects DATABASE_URL and the override", () => {
  withEnv(undefined, () => {
    assert.equal(isConfigured(), false);
    __setPool({ query: async () => ({ rows: [] }) });
    assert.equal(isConfigured(), true);
    __setPool(null);
    assert.equal(isConfigured(), false);
  });
  withEnv("postgres://user:pass@host/db", () => {
    assert.equal(isConfigured(), true);
  });
});

test("getPool returns the override while one is set", () => {
  const fake = { query: async () => ({ rows: [] }) };
  __setPool(fake);
  assert.equal(getPool(), fake);
});

test("a fresh pool handles idle client errors instead of crashing the process", async () => {
  const pool = createPool();
  try {
    assert.ok(pool.listenerCount("error") > 0);
    assert.doesNotThrow(() => {
      pool.emit("error", new Error("connection terminated unexpectedly"), {});
    });
  } finally {
    await pool.end().catch(() => {});
  }
});

test("the idle timeout sits between a visitor gap and Neon's autosuspend", async () => {
  const pool = createPool();
  try {
    const idle = pool.options.idleTimeoutMillis;
    assert.ok(idle >= 60 * 1000, `idleTimeoutMillis ${idle} too short`);
    assert.ok(idle < 5 * 60 * 1000, `idleTimeoutMillis ${idle} too long`);
    assert.equal(pool.options.max, 3);
  } finally {
    await pool.end().catch(() => {});
  }
});
