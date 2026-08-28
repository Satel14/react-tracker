const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildMatchClock } = require("./telemetryUtils");

// _D runs 7 s ahead of the in-game clock.
const at = (elapsed) => new Date(Date.UTC(2026, 0, 1, 0, 0, elapsed + 7)).toISOString();

const positions = [10, 20, 30, 40, 50].map((elapsed) => ({
  _T: "LogPlayerPosition",
  _D: at(elapsed),
  common: { isGame: 1 },
  elapsedTime: elapsed,
  character: { accountId: "account.me" },
}));

test("derives the offset from the position stream", () => {
  const clock = buildMatchClock(positions);
  assert.equal(clock.sampleCount, 5);
  // offsetSeconds is the wall-clock epoch-second at elapsed=0, not the 7 s skew.
  assert.equal(clock.offsetSeconds, Date.parse(at(0)) / 1000);
});

test("timeOf prefers a top-level elapsedTime", () => {
  const clock = buildMatchClock(positions);
  assert.equal(clock.timeOf(positions[0]), 10);
});

test("timeOf prefers gameState.elapsedTime for gamestate events", () => {
  const clock = buildMatchClock(positions);
  const ev = { _T: "LogGameStatePeriodic", _D: at(999), gameState: { elapsedTime: 33 } };
  assert.equal(clock.timeOf(ev), 33);
});

test("timeOf maps a _D-only event onto the in-game clock", () => {
  const clock = buildMatchClock(positions);
  // A kill whose _D matches the t=20 position sample must land on t=20, not t=27.
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(20) }), 20);
});

test("ignores warm-up samples when fitting", () => {
  const warmup = {
    _T: "LogPlayerPosition",
    _D: new Date(Date.UTC(2025, 11, 31, 23, 59, 0)).toISOString(),
    common: { isGame: 0 },
    elapsedTime: 0,
    character: { accountId: "account.me" },
  };
  const clock = buildMatchClock([warmup, ...positions]);
  assert.equal(clock.sampleCount, 5);
  assert.equal(clock.offsetSeconds, Date.parse(at(0)) / 1000);
});

test("reports the residual spread and clamps negative times to 0", () => {
  const noisy = [
    ...positions,
    { _T: "LogPlayerPosition", _D: at(63), common: { isGame: 1 }, elapsedTime: 60, character: { accountId: "a" } },
  ];
  const clock = buildMatchClock(noisy);
  assert.ok(clock.residualSeconds > 0);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(-100) }), 0);
});

test("has no clock when no position samples carry both clocks", () => {
  const clock = buildMatchClock([{ _T: "LogPlayerKillV2", _D: at(5) }]);
  assert.equal(clock.offsetSeconds, null);
  assert.equal(clock.sampleCount, 0);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(5) }), null);
});

test("returns null when an event carries no usable time at all", () => {
  const clock = buildMatchClock(positions);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2" }), null);
});
