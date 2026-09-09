const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeSeries,
  feasibilityWindows,
  enumerateAssignments,
  LAG_MAX,
  MATCH_MAX,
  VOID,
} = require("./assignment");

const MIN = 60 * 1000;
const T0 = Date.parse("2026-09-01T13:00:00Z");
const at = (mins) => T0 + mins * MIN;

const snap = (rankPoint, roundsPlayed, firstSeenAt, lastSeenAt = firstSeenAt) => ({
  rankPoint, roundsPlayed, tier: "gold", firstSeenAt, lastSeenAt,
});
const match = (createdAt, { duration = 25 * MIN, survivalTime = 10 * MIN, ...rest } = {}) => ({
  createdAt: new Date(createdAt).toISOString(),
  matchType: "competitive",
  duration: duration === null ? undefined : duration / 1000,
  survivalTime: survivalTime === null ? undefined : survivalTime / 1000,
  ...rest,
});

// ------------------------------------------------------------ sanitizeSeries

test("sanitizeSeries keeps a well-formed series untouched", () => {
  const raw = [snap(3000, 100, at(0)), snap(3020, 101, at(30))];
  assert.deepEqual(sanitizeSeries(raw), raw);
});

test("sanitizeSeries drops a reading whose round counter goes backwards", () => {
  // Two writers: a stale read from the live view lands after the poller's newer one.
  const series = sanitizeSeries([snap(3000, 100, at(0)), snap(3020, 101, at(30)), snap(3000, 100, at(31))]);
  assert.equal(series.length, 2);
  assert.deepEqual(series.map((r) => r.roundsPlayed), [100, 101]);
});

test("sanitizeSeries merges adjacent identical readings and extends lastSeenAt", () => {
  const series = sanitizeSeries([snap(3000, 100, at(0), at(5)), snap(3000, 100, at(10), at(20))]);
  assert.equal(series.length, 1);
  assert.equal(series[0].firstSeenAt, at(0));
  assert.equal(series[0].lastSeenAt, at(20), "the merged row is seen until the later sighting");
});

test("sanitizeSeries keeps a same-rounds reading whose RP differs", () => {
  // Modes disagreed for one poll: rankPoint null, rounds unchanged. A distinct row.
  const series = sanitizeSeries([snap(3000, 100, at(0)), snap(null, 100, at(5)), snap(3000, 100, at(10))]);
  assert.equal(series.length, 3);
});

test("sanitizeSeries tolerates junk", () => {
  assert.deepEqual(sanitizeSeries(null), []);
  assert.deepEqual(sanitizeSeries([]), []);
});

test("sanitizeSeries does not mutate its input", () => {
  const raw = [snap(3000, 100, at(0), at(5)), snap(3000, 100, at(10), at(20))];
  const copy = JSON.parse(JSON.stringify(raw));
  sanitizeSeries(raw);
  assert.deepEqual(raw, copy);
});

// -------------------------------------------------------- feasibilityWindows

const windowsFor = (series, items, extra = {}) =>
  feasibilityWindows({ series, items, maxHistory: 8, ...extra });

test("a match is bounded below by the player's death and above by its end plus the lag", () => {
  // Match runs 13:10-13:35, player dies at 13:20. Countable from 13:20, and no
  // later than 13:35 + 15 min = 13:50.
  const series = [snap(3000, 100, at(0)), snap(3020, 101, at(25)), snap(3040, 102, at(55))];
  const { windows } = windowsFor(series, [match(at(10), { duration: 25 * MIN, survivalTime: 10 * MIN })]);
  // reading 1 is at 13:25 (>= death 13:20) -> lo = 1
  // reading 2 is at 13:55 (>= 13:50) -> hi = 2
  assert.deepEqual(windows[0], [1, 2]);
});

test("a match the readings cannot yet cover reaches past the last interval", () => {
  const series = [snap(3000, 100, at(0)), snap(3020, 101, at(25))];
  const { windows } = windowsFor(series, [match(at(20))]);
  assert.equal(windows[0][1], 2, "n + 1 means the RP has not landed in any reading yet");
});

test("a missing duration is treated as the longest possible match, not as an instant one", () => {
  const series = [snap(3000, 100, at(0)), snap(3020, 101, at(40))];
  const { windows } = windowsFor(series, [match(at(10), { duration: null, survivalTime: null })]);
  // ended falls back to 13:10 + 35 min = 13:45, + 15 lag = 14:00, past the last
  // reading at 13:40 -> the upper bound is open.
  assert.equal(windows[0][1], 2);
  assert.equal(windows[0][0], 1, "with no survival time the lower bound is the match start");
});

test("an impossible window keeps the lower bound and opens the upper one", () => {
  // The lag assumption is violated: the reading that should already hold this
  // match sits before the death. Trust only what we know.
  const series = [snap(3000, 100, at(0)), snap(3020, 101, at(5))];
  const { windows } = windowsFor(series, [match(at(30), { survivalTime: 5 * MIN })]);
  const [lo, hi] = windows[0];
  assert.ok(hi >= lo, "hi is never below lo");
  assert.equal(hi, 2);
});

test("slack opens at the newer end while the list may not have caught up", () => {
  const series = [snap(3000, 100, at(0)), snap(3020, 101, at(60))];
  const { slackAllowed } = windowsFor(series, [match(at(10))], { fetchedAt: at(60), complete: false });
  assert.equal(slackAllowed(1), true, "the last reading is within the lag of the fetch");
});

test("slack closes at the newer end once the fetch is well past the reading", () => {
  const series = [snap(3000, 100, at(0)), snap(3020, 101, at(60))];
  const { slackAllowed } = windowsFor(series, [match(at(10))], { fetchedAt: at(120), complete: true });
  assert.equal(slackAllowed(1), false);
});

test("slack opens at the older end when a full page might be hiding an older match", () => {
  const items = Array.from({ length: 8 }, (_, i) => match(at(10 + i * 30)));
  const series = [snap(3000, 100, at(5)), snap(3020, 101, at(300))];
  const { slackAllowed } = windowsFor(series, items, { fetchedAt: at(300), complete: false });
  assert.equal(slackAllowed(1), true);
});

test("a list known to be complete never opens slack at the older end", () => {
  const items = Array.from({ length: 8 }, (_, i) => match(at(10 + i * 30)));
  const series = [snap(3000, 100, at(5)), snap(3020, 101, at(300))];
  const { slackAllowed } = windowsFor(series, items, { fetchedAt: at(400), complete: true });
  assert.equal(slackAllowed(1), false);
});

// ----------------------------------------------------- enumerateAssignments

const enumerate = (opts) =>
  enumerateAssignments({
    order: opts.order,
    windows: opts.windows,
    dRounds: opts.dRounds,
    orderPairs: opts.orderPairs || [],
    slackAllowed: opts.slackAllowed || (() => false),
    voidable: opts.voidable || new Set(),
    n: opts.n,
    budget: opts.budget,
  });

test("one match and one round leave exactly one assignment", () => {
  const result = enumerate({ order: [0], windows: { 0: [1, 1] }, dRounds: [0, 1], n: 1 });
  assert.equal(result.exhausted, false);
  assert.deepEqual(result.solutions, [{ 0: 1 }]);
  assert.equal(result.slackUsed.size, 0);
});

test("an interval that cannot absorb another round rejects the assignment", () => {
  const result = enumerate({ order: [0, 1], windows: { 0: [1, 1], 1: [1, 1] }, dRounds: [0, 1], n: 1 });
  assert.deepEqual(result.solutions, [], "two matches cannot both own the single round");
});

test("an unaccounted round is only allowed where slack is", () => {
  const closed = enumerate({ order: [0], windows: { 0: [1, 1] }, dRounds: [0, 2], n: 1 });
  assert.deepEqual(closed.solutions, [], "the second round has nowhere to come from");

  const open = enumerate({ order: [0], windows: { 0: [1, 1] }, dRounds: [0, 2], n: 1, slackAllowed: () => true });
  assert.equal(open.solutions.length, 1);
  assert.ok(open.slackUsed.has(1), "the interval is marked, so no row in it can be exact");
});

test("the order constraint rules out assignments that put a later match first", () => {
  // Two matches, two intervals of one round each. The round counter alone
  // cannot say which match went where -- both pairings balance.
  const free = enumerate({ order: [0, 1], windows: { 0: [1, 2], 1: [1, 2] }, dRounds: [0, 1, 1], n: 2 });
  assert.equal(free.solutions.length, 2, "ambiguous without the order constraint");

  // Once we know match 0 also ended first, only one pairing survives -- and
  // that is what lets attribute.js call each row exact.
  const ordered = enumerate({
    order: [0, 1], windows: { 0: [1, 2], 1: [1, 2] }, dRounds: [0, 1, 1], n: 2,
    orderPairs: [[0, 1]],
  });
  assert.deepEqual(ordered.solutions, [{ 0: 1, 1: 2 }]);
});

test("a voidable match may consume no round at all", () => {
  const result = enumerate({
    order: [0], windows: { 0: [1, 1] }, dRounds: [0, 0], n: 1, voidable: new Set([0]),
  });
  assert.deepEqual(result.solutions, [{ 0: VOID }]);
});

test("exceeding the node budget reports exhaustion and yields no solutions", () => {
  // Ten matches free to sit anywhere across ten intervals: far more nodes than 50.
  const order = Array.from({ length: 10 }, (_, i) => i);
  const windows = Object.fromEntries(order.map((i) => [i, [1, 10]]));
  const dRounds = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const result = enumerate({ order, windows, dRounds, n: 10, budget: 50 });
  assert.equal(result.exhausted, true);
  assert.deepEqual(result.solutions, [], "an incomplete search may never claim agreement");
  assert.equal(result.slackUsed.size, 0);
});

test("the exported constants are the ones the rule is written against", () => {
  assert.equal(LAG_MAX, 15 * MIN);
  assert.equal(MATCH_MAX, 35 * MIN);
});
