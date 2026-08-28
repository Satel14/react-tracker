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

test("derives the origin from the position stream", () => {
  const clock = buildMatchClock(positions);
  assert.equal(clock.sampleCount, 5);
  // originSeconds is the wall-clock epoch-second at elapsed=0, not the 7 s skew.
  assert.equal(clock.originSeconds, Date.parse(at(0)) / 1000);
});

test("timeOf prefers a top-level elapsedTime", () => {
  const clock = buildMatchClock(positions);
  // _D disagrees with elapsedTime (would derive 999 via _D) so precedence is discriminating.
  const ev = { _T: "LogPlayerPosition", _D: at(999), elapsedTime: 10, common: { isGame: 1 }, character: { accountId: "account.me" } };
  assert.equal(clock.timeOf(ev), 10);
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
  assert.equal(clock.originSeconds, Date.parse(at(0)) / 1000);
});

test("reports the residual spread and clamps negative times to 0", () => {
  // Five samples whose _D drifts 5..9 s ahead of the in-game clock, so the
  // interquartile range is genuinely non-zero.
  const spread = [10, 20, 30, 40, 50].map((elapsed, i) => ({
    _T: "LogPlayerPosition",
    _D: new Date(Date.UTC(2026, 0, 1, 0, 0, elapsed + 5 + i)).toISOString(),
    common: { isGame: 1 },
    elapsedTime: elapsed,
    character: { accountId: "account.me" },
  }));
  const clock = buildMatchClock(spread);
  // Residuals are 5,6,7,8,9 s in index order; the median (odd length 5) sits
  // at index 2 (elapsed=30), so that sample's own residual is the expected origin.
  assert.equal(clock.originSeconds, Date.parse(spread[2]._D) / 1000 - spread[2].elapsedTime);
  assert.equal(clock.residualSeconds, 2);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(-100) }), 0);
});

test("an outlier outside the quartiles does not inflate the residual spread", () => {
  const noisy = [
    ...positions,
    { _T: "LogPlayerPosition", _D: at(63), common: { isGame: 1 }, elapsedTime: 60, character: { accountId: "a" } },
  ];
  assert.equal(buildMatchClock(noisy).residualSeconds, 0);
});

test("has no clock when no position samples carry both clocks", () => {
  const clock = buildMatchClock([{ _T: "LogPlayerKillV2", _D: at(5) }]);
  assert.equal(clock.originSeconds, null);
  assert.equal(clock.sampleCount, 0);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(5) }), null);
});

test("has no clock when a position carries _D but no elapsedTime", () => {
  const noElapsed = { _T: "LogPlayerPosition", _D: at(10), common: { isGame: 1 }, character: { accountId: "account.me" } };
  const clock = buildMatchClock([noElapsed]);
  assert.equal(clock.sampleCount, 0);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(10) }), null);
});

test("returns null when an event carries no usable time at all", () => {
  const clock = buildMatchClock(positions);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2" }), null);
});

test("an explicit null elapsedTime falls through to the _D-derived time", () => {
  const clock = buildMatchClock(positions);
  // A kill with elapsedTime: null and _D matching the t=20 position sample
  // must land on 20, not be coerced to 0 via Number(null).
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: at(20), elapsedTime: null }), 20);
});
