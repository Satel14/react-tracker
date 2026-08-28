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

test("a zero-round shell mode does not null out an otherwise-agreeing reading", () => {
  const reading = readRankedSnapshot(
    { "squad-fpp": MODE(3153, 8), shell: { currentRankPoint: 0, roundsPlayed: 0 } },
    { tier: "Diamond" }
  );
  assert.equal(reading.rankPoint, 3153);
  assert.equal(reading.modes.shell.rankPoint, 0);
});

test("a genuine disagreement between two played modes still nulls the reading and logs once", () => {
  const originalLog = console.log;
  const logs = [];
  console.log = (message) => logs.push(message);
  try {
    const reading = readRankedSnapshot({ squad: MODE(3153, 8), "squad-fpp": MODE(3200, 292) }, { tier: "Diamond" });
    assert.equal(reading.rankPoint, null);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^\[RP\] Mode RP values disagree for a reading: /);
  } finally {
    console.log = originalLog;
  }
});

test("rankPoint 0 from a played mode is preserved, not treated as absent", () => {
  const reading = readRankedSnapshot({ "squad-fpp": MODE(0, 50) }, { tier: "Bronze" });
  assert.equal(reading.rankPoint, 0);
});

test("a reading with only a zero-round mode still falls back to reading its RP", () => {
  const reading = readRankedSnapshot({ shell: { currentRankPoint: 5000, roundsPlayed: 0 } }, null);
  assert.equal(reading.rankPoint, 5000);
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
