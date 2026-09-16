const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  recordRankLookup,
  recordRateLimit,
  recordRankPointReading,
  getRuntimeStats,
  __resetRuntimeStats,
} = require("./runtimeStats");

beforeEach(() => __resetRuntimeStats());

// Everything here is scoped to one process, and on a free Render instance that
// process is minutes old more often than not. Zero has to read as "nothing has
// happened yet" rather than as a measurement.
test("reports zeroes before anything has happened", () => {
  const stats = getRuntimeStats();

  assert.deepEqual(stats.rankLookups, {
    total: 0,
    fresh: 0,
    cached: 0,
    stale: 0,
    coalesced: 0,
    servedFromCachePct: null,
  });
});

// Only a "fresh" lookup pays for a full set of upstream fetches, so everything
// else is the cache doing its job. Not the same as "spent nothing": a cached
// lookup may still refresh one rank-point reading, which rankPointReadings
// counts separately.
test("counts each outcome and says what share came from cache", () => {
  recordRankLookup("fresh");
  recordRankLookup("cached");
  recordRankLookup("cached");
  recordRankLookup("stale");

  const { rankLookups } = getRuntimeStats();

  assert.equal(rankLookups.total, 4);
  assert.equal(rankLookups.fresh, 1);
  assert.equal(rankLookups.cached, 2);
  assert.equal(rankLookups.stale, 1);
  assert.equal(rankLookups.servedFromCachePct, 75);
});

// A mistyped outcome at a call site used to be unnoticeable: `counters[typo] +=
// 1` makes NaN out of undefined and pins it there for the life of the process,
// so /healthz would answer "total: null" and the real counts would be gone.
// Dropping it keeps every other number readable; the typo is a code bug and
// shows up in the tests of the call site, not in production telemetry.
test("an outcome it does not know leaves the counters alone", () => {
  recordRankLookup("cached");
  recordRankLookup("chached");

  const { rankLookups } = getRuntimeStats();

  assert.equal(rankLookups.total, 1);
  assert.equal(rankLookups.cached, 1);
  assert.equal(rankLookups.servedFromCachePct, 100);
  assert.deepEqual(Object.keys(rankLookups).filter((key) => key.includes("chached")), []);
});

// The rate limit is 100/min and measured, not guessed. A count climbing while
// the instance is up is the signal that the budget is actually being hit rather
// than that one unlucky request was refused.
test("counts rate limits and remembers when the last one landed", () => {
  assert.deepEqual(getRuntimeStats().rateLimit, { count: 0, lastAt: null });

  recordRateLimit();
  recordRateLimit();

  const { rateLimit } = getRuntimeStats();
  assert.equal(rateLimit.count, 2);
  assert.ok(Date.parse(rateLimit.lastAt), "carries when it happened");
});

// RP readings are what every delta in the Recent Matches card is diffed
// against, and they are written fire-and-forget. A process serving lookups with
// this stuck at zero means the writes are not happening at all.
test("counts rank-point readings and remembers the last one", () => {
  assert.deepEqual(getRuntimeStats().rankPointReadings, { count: 0, lastAt: null });

  recordRankPointReading();

  const { rankPointReadings } = getRuntimeStats();
  assert.equal(rankPointReadings.count, 1);
  assert.ok(Date.parse(rankPointReadings.lastAt));
});
