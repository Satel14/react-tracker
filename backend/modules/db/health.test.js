const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  recordDbError,
  recordDbOk,
  isDbFailing,
  getDbHealth,
  __resetDbHealth,
} = require("./health");

beforeEach(() => __resetDbHealth());

test("says nothing before any query has run", () => {
  assert.deepEqual(getDbHealth(), { status: "unknown" });
  assert.equal(isDbFailing(), false, "silence is not a failure");
});

test("reports a failure with its scope and message", () => {
  recordDbError("recent-searches", "data transfer quota exceeded");
  assert.equal(isDbFailing(), true);
  const health = getDbHealth();
  assert.equal(health.status, "failing");
  assert.equal(health.scope, "recent-searches");
  assert.equal(health.error, "data transfer quota exceeded");
  assert.ok(Date.parse(health.at), "carries when it happened");
});

// A store that recovers has to be able to say so, or every fallback keyed on
// this would stay switched on for the life of the process.
test("a later success clears the failure", () => {
  recordDbError("census", "boom");
  recordDbOk("census");
  assert.equal(isDbFailing(), false);
  assert.equal(getDbHealth().status, "ok");
});

// Both of these run inside one millisecond, which is the point: ordering has to
// come from the counter, because comparing Date.now() would call a tie either
// way and this pair would pass by luck.
test("a failure after a success is a failure again", () => {
  recordDbOk("census");
  recordDbError("census", "boom");
  assert.equal(isDbFailing(), true);
  assert.ok(getDbHealth().lastOkAt, "and it still remembers when it last worked");
});

test("an error with no message still reads as a failure", () => {
  recordDbError("census", "");
  assert.equal(isDbFailing(), true);
  assert.equal(getDbHealth().error, "unknown Postgres failure");
});
