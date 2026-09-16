const { test } = require("node:test");
const assert = require("node:assert/strict");
const { benchmarks, placementAbove, MIN_ACCOUNTS, MIN_LOBBIES } = require("./benchmarks");

// One sampled player, in a named lobby, with a performance.
const seat = (matchId, tier, over = {}) => ({
  matchId, tier, damage: 200, kills: 1, timeSurvived: 900, winPlace: 8, rosterCount: 16, ...over,
});

// Enough rows that the gate is cleared, so a test about arithmetic is not
// silently a test about the gate.
const published = (tier, over = {}) =>
  Array.from({ length: MIN_ACCOUNTS }, (_, i) => seat(i + 1, tier, over));

test("placement is a share of teams beaten, not a raw place", () => {
  assert.equal(placementAbove({ winPlace: 1, rosterCount: 16 }), 1);
  assert.equal(placementAbove({ winPlace: 16, rosterCount: 16 }), 0);
  assert.equal(placementAbove({ winPlace: 9, rosterCount: 17 }), 0.5);
});

// A one-team payload has no ordering to express, and dividing by rosterCount-1
// would be a division by zero.
test("a lobby with one roster yields no placement", () => {
  assert.equal(placementAbove({ winPlace: 1, rosterCount: 1 }), null);
  assert.equal(placementAbove({ winPlace: 4, rosterCount: null }), null);
  assert.equal(placementAbove({ winPlace: 20, rosterCount: 16 }), null);
});

test("a tier's averages are computed over its own rows", () => {
  const rows = [...published("gold", { damage: 100 }), ...published("diamond", { damage: 400 })];
  const [gold, diamond] = ["gold", "diamond"].map((t) => benchmarks(rows).find((r) => r.tier === t));
  assert.equal(gold.metrics.damage.mean, 100);
  assert.equal(diamond.metrics.damage.mean, 400);
  assert.equal(gold.metrics.minutesAlive.mean, 15);
});

test("a tier below the account floor is reported unpublishable, not omitted", () => {
  const rows = Array.from({ length: MIN_ACCOUNTS - 1 }, (_, i) => seat(i + 1, "master"));
  const master = benchmarks(rows).find((r) => r.tier === "master");
  assert.equal(master.accounts, MIN_ACCOUNTS - 1);
  assert.equal(master.publishable, false);
});

// The gate counts LOBBIES as well as accounts: a hundred players drawn from ten
// lobbies are ten witnesses to what a lobby looks like.
test("enough accounts from too few lobbies does not clear the gate", () => {
  const rows = Array.from({ length: MIN_ACCOUNTS }, (_, i) => seat((i % (MIN_LOBBIES - 1)) + 1, "gold"));
  assert.equal(benchmarks(rows).find((r) => r.tier === "gold").publishable, false);
});

test("a row clearing both floors is published", () => {
  assert.equal(benchmarks(published("gold")).find((r) => r.tier === "gold").publishable, true);
});

test("the no-kill share is a proportion of the matches that reported kills", () => {
  const rows = [
    ...Array.from({ length: MIN_ACCOUNTS / 2 }, (_, i) => seat(i + 1, "gold", { kills: 0 })),
    ...Array.from({ length: MIN_ACCOUNTS / 2 }, (_, i) => seat(i + 51, "gold", { kills: 2 })),
  ];
  const gold = benchmarks(rows).find((r) => r.tier === "gold");
  assert.equal(gold.metrics.noKillShare.share, 0.5);
});

// Absence is not zero, in both directions: an unreported field must neither
// enter a mean as 0 nor count as a no-kill match.
test("an unreported field is excluded from its own metric's sample", () => {
  const rows = [...published("gold"), seat(MIN_ACCOUNTS + 1, "gold", { damage: null, kills: null })];
  const gold = benchmarks(rows).find((r) => r.tier === "gold");
  assert.equal(gold.accounts, MIN_ACCOUNTS + 1);
  assert.equal(gold.metrics.damage.n, MIN_ACCOUNTS);
  assert.equal(gold.metrics.kills.n, MIN_ACCOUNTS);
  assert.equal(gold.metrics.noKillShare.n, MIN_ACCOUNTS);
  assert.equal(gold.metrics.minutesAlive.n, MIN_ACCOUNTS + 1);
});

// THE ONE THAT MATTERS. Every row written before these columns existed carries
// nulls. Counting rows rather than readings publishes a tier average computed
// from a single match -- and the frontend accepts it, because the mean is a
// finite number. Run against the first draft, this came back publishable with
// damage.n === 1.
test("legacy rows without metrics cannot carry a published average", () => {
  const legacy = Array.from({ length: MIN_ACCOUNTS - 1 }, (_, i) =>
    seat(i + 1, "gold", { damage: null, kills: null, timeSurvived: null, winPlace: null, rosterCount: null }));
  const gold = benchmarks([...legacy, seat(MIN_ACCOUNTS, "gold")]).find((r) => r.tier === "gold");
  assert.equal(gold.accounts, MIN_ACCOUNTS);
  assert.equal(gold.metrics.damage.n, 1);
  assert.equal(gold.publishable, false);
});

test("one thin metric gates the whole row, never just its column", () => {
  const rows = published("gold").map((row, i) => (i < 5 ? { ...row, winPlace: null } : row));
  const gold = benchmarks(rows).find((r) => r.tier === "gold");
  assert.equal(gold.metrics.damage.n, MIN_ACCOUNTS);
  assert.equal(gold.metrics.placement.n, MIN_ACCOUNTS - 5);
  assert.equal(gold.publishable, false);
});

// The design effect must be read off the tier's own seats per lobby. Passing
// PER_MATCH (15) here is the mistake this test exists to catch: every fixture
// above has one seat per lobby, so ICC is 0, deff is 1 either way, and the
// substitution passes unnoticed.
test("the interval is discounted by this tier's own seats per lobby, not by fifteen", () => {
  const rows = [];
  for (let lobby = 1; lobby <= 40; lobby += 1) {
    const base = lobby % 2 ? 100 : 300;
    for (let s = 0; s < 3; s += 1) rows.push(seat(lobby, "gold", { damage: base + s }));
  }
  const gold = benchmarks(rows).find((r) => r.tier === "gold");
  // Three gold seats in every lobby, so Kish's mean cluster size is exactly 3.
  assert.ok(Math.abs(gold.metrics.damage.designEffect - 3) < 0.01,
    `deff was ${gold.metrics.damage.designEffect}, expected ~3 -- 15 means PER_MATCH leaked in`);
  assert.equal(gold.metrics.damage.effectiveN, 40);
});

// Unequal clusters are the normal case, and the simple mean understates the
// correction for them.
test("an uneven lobby raises the cluster size above the simple average", () => {
  const rows = [];
  for (let lobby = 1; lobby <= 30; lobby += 1) rows.push(seat(lobby, "gold", { damage: 100 + lobby }));
  for (let s = 0; s < 10; s += 1) rows.push(seat(99, "gold", { damage: 400 + s }));
  const gold = benchmarks(rows).find((r) => r.tier === "gold");
  // 30 lobbies of one seat and one of ten: simple mean 40/31 = 1.29,
  // Kish's sum of squares 130/40 = 3.25.
  const simpleMean = 40 / 31;
  assert.ok(gold.metrics.damage.clusterSize > simpleMean * 2,
    `clusterSize was ${gold.metrics.damage.clusterSize}, expected Kish's ~3.25`);
});

test("rows come back in ladder order and unranked never gets one", () => {
  const rows = [...published("diamond"), ...published("bronze"), ...published("gold"),
    ...Array.from({ length: MIN_ACCOUNTS }, (_, i) => seat(i + 1, null))];
  assert.deepEqual(benchmarks(rows).map((r) => r.tier), ["bronze", "gold", "diamond"]);
});
