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

// Four stores share this module, and each caller asks about its own. RP history
// writes fire and forget on every player lookup, so they are by far the likeliest
// to fail -- and one flag for all of them would make the census page answer
// no-store and rebuild ~12k rows for every visitor, which is the transfer
// blowout its six-hour cache exists to prevent.
test("a failure in one store does not condemn another", () => {
  recordDbError("rank-point-history", "connection terminated unexpectedly");
  recordDbOk("census");

  assert.equal(isDbFailing("census"), false);
  assert.equal(isDbFailing("rank-point-history"), true);
});

test("a store nobody has queried yet is not failing", () => {
  recordDbError("rank-point-history", "boom");

  assert.equal(isDbFailing("recent-searches"), false);
});

// /healthz asks about the process, not about one table: a store that is down
// while another is up is exactly the silent outage this module exists to catch.
test("asked about the process as a whole, any failing store counts", () => {
  recordDbError("rank-point-history", "quota");
  recordDbOk("census");

  assert.equal(isDbFailing(), true);
  const health = getDbHealth();
  assert.equal(health.status, "failing");
  assert.equal(health.scope, "rank-point-history");
  assert.equal(health.error, "quota");
});

test("every store healthy reads as ok", () => {
  recordDbOk("census");
  recordDbOk("recent-searches");

  assert.equal(isDbFailing(), false);
  assert.equal(getDbHealth().status, "ok");
});

test("a store recovers on its own without waiting for the others", () => {
  recordDbError("census", "boom");
  recordDbOk("recent-searches");
  assert.equal(isDbFailing(), true);

  recordDbOk("census");
  assert.equal(isDbFailing(), false);
  assert.equal(isDbFailing("census"), false);
});
