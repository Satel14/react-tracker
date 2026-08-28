const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readRankedSnapshot, applyReading, sameValues } = require("./reading");

const MODE = (currentRankPoint, roundsPlayed, tier = "Diamond") => ({
  currentRankPoint,
  bestRankPoint: currentRankPoint + 100,
  roundsPlayed,
  currentTier: { tier, subTier: "3" },
  kills: 1,
});

test("collapses unified per-mode stats into one reading", () => {
  const reading = readRankedSnapshot(
    { "duo-fpp": MODE(3153, 8), "squad-fpp": MODE(3153, 292) },
    { tier: "Diamond", subTier: "3" }
  );
  assert.deepEqual(reading, {
    rankPoint: 3153,
    roundsPlayed: 300,
    tier: "Diamond",
    modes: {
      "duo-fpp": { rankPoint: 3153, roundsPlayed: 8, tier: "Diamond" },
      "squad-fpp": { rankPoint: 3153, roundsPlayed: 292, tier: "Diamond" },
    },
  });
});

test("records null RP when modes disagree, but keeps the per-mode detail", () => {
  const reading = readRankedSnapshot({ squad: MODE(3153, 8), "squad-fpp": MODE(3200, 292) }, { tier: "Diamond" });
  assert.equal(reading.rankPoint, null);
  assert.equal(reading.roundsPlayed, 300);
  assert.equal(reading.modes.squad.rankPoint, 3153);
  assert.equal(reading.modes["squad-fpp"].rankPoint, 3200);
});

test("ignores modes without an RP value when deciding unification", () => {
  const reading = readRankedSnapshot({ squad: { roundsPlayed: 2 }, "squad-fpp": MODE(3153, 10) }, null);
  assert.equal(reading.rankPoint, 3153);
  assert.equal(reading.roundsPlayed, 12);
  assert.equal(reading.tier, null);
  assert.equal(reading.modes.squad.rankPoint, null);
  assert.equal(reading.modes.squad.tier, null);
});

test("returns null when there are no modes", () => {
  assert.equal(readRankedSnapshot({}, null), null);
  assert.equal(readRankedSnapshot(null, null), null);
  assert.equal(readRankedSnapshot(undefined), null);
});

test("sameValues compares rankPoint and roundsPlayed only, with null equal to null", () => {
  assert.equal(sameValues({ rankPoint: 3153, roundsPlayed: 10 }, { rankPoint: 3153, roundsPlayed: 10, tier: "x" }), true);
  assert.equal(sameValues({ rankPoint: null, roundsPlayed: 10 }, { rankPoint: null, roundsPlayed: 10 }), true);
  assert.equal(sameValues({ rankPoint: 3153, roundsPlayed: 10 }, { rankPoint: 3153, roundsPlayed: 11 }), false);
  assert.equal(sameValues({ rankPoint: 3153, roundsPlayed: 10 }, { rankPoint: null, roundsPlayed: 10 }), false);
});

test("applyReading extends the last snapshot when the values are unchanged", () => {
  const series = [{ rankPoint: 3153, roundsPlayed: 10, tier: "Gold", modes: {}, firstSeenAt: 100, lastSeenAt: 200 }];
  const next = applyReading(series, { rankPoint: 3153, roundsPlayed: 10, tier: "Gold", modes: {} }, 500);
  assert.equal(next.length, 1);
  assert.equal(next[0].firstSeenAt, 100);
  assert.equal(next[0].lastSeenAt, 500);
  assert.equal(series[0].lastSeenAt, 200, "input must not be mutated");
});

test("applyReading appends a new snapshot when the values changed", () => {
  const series = [{ rankPoint: 3153, roundsPlayed: 10, tier: "Gold", modes: {}, firstSeenAt: 100, lastSeenAt: 200 }];
  const next = applyReading(series, { rankPoint: 3176, roundsPlayed: 11, tier: "Gold", modes: {} }, 500);
  assert.equal(next.length, 2);
  assert.deepEqual(next[1], { rankPoint: 3176, roundsPlayed: 11, tier: "Gold", modes: {}, firstSeenAt: 500, lastSeenAt: 500 });
});

test("applyReading starts a series from nothing", () => {
  const next = applyReading([], { rankPoint: 3176, roundsPlayed: 11, tier: null, modes: {} }, 500);
  assert.equal(next.length, 1);
  assert.equal(next[0].firstSeenAt, 500);
  assert.deepEqual(applyReading(undefined, { rankPoint: 1, roundsPlayed: 1, tier: null, modes: {} }, 7).length, 1);
});
