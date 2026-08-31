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

// ---------------------------------------------------------------------------
// Monotone piecewise clock. Measured on 8 real matches: the residual
// (_D - elapsedTime) rises monotonically through a match by +4.9 s to +18.7 s,
// on a saturating curve. A single global offset is wrong at both ends by half
// that; a least-squares line is worse still, because lobby samples all carry
// elapsedTime 0 while their _D spans a minute.
// ---------------------------------------------------------------------------

const EPOCH = Date.UTC(2026, 0, 1) / 1000;
// Residual rises linearly 0 -> 12 s across a 1200 s match.
const drift = (t) => t / 100;
const wallAt = (t) => new Date((EPOCH + t + drift(t)) * 1000).toISOString();

const drifting = [];
for (let t = 0; t <= 1200; t += 10) {
  drifting.push({
    _T: "LogPlayerPosition",
    _D: wallAt(t),
    common: { isGame: 1 },
    elapsedTime: t,
    character: { accountId: "account.me" },
  });
}

test("maps _D-only events through a drifting clock at both ends", () => {
  const clock = buildMatchClock(drifting);
  for (const t of [0, 100, 300, 600, 900, 1100, 1200]) {
    assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: wallAt(t) }), t);
  }
});

test("beats a single global offset late in the match", () => {
  const clock = buildMatchClock(drifting);
  // The global median residual is 6 s (drift at t=600). A single-offset model
  // would put this t=1200 event at 1206. The piecewise model must not.
  const single = Math.round(Date.parse(wallAt(1200)) / 1000 - clock.originSeconds);
  assert.equal(single, 1206);
  assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: wallAt(1200) }), 1200);
});

test("timeOf stays monotonic across the whole match", () => {
  const clock = buildMatchClock(drifting);
  let prev = -1;
  for (let t = 0; t <= 1250; t += 7) {
    const mapped = clock.timeOf({ _T: "LogPlayerKillV2", _D: wallAt(t) });
    assert.ok(mapped >= prev, `t=${t} mapped to ${mapped} after ${prev}`);
    prev = mapped;
  }
});

test("lobby samples cannot move the fit", () => {
  // 50 warm-up samples all claiming elapsedTime 0 while _D spans 90 s of lobby.
  // These are what destroy a least-squares fit; isGame must exclude them.
  const lobby = [];
  for (let i = 0; i < 50; i += 1) {
    lobby.push({
      _T: "LogPlayerPosition",
      _D: new Date((EPOCH - 90 + i * 1.8) * 1000).toISOString(),
      common: { isGame: 0 },
      elapsedTime: 0,
      character: { accountId: "account.lobby" },
    });
  }
  const clean = buildMatchClock(drifting);
  const dirty = buildMatchClock([...lobby, ...drifting]);
  assert.equal(dirty.sampleCount, clean.sampleCount);
  for (const t of [0, 600, 1200]) {
    assert.equal(dirty.timeOf({ _T: "LogPlayerKillV2", _D: wallAt(t) }), clean.timeOf({ _T: "LogPlayerKillV2", _D: wallAt(t) }));
  }
});

test("forces the residual table to be non-decreasing", () => {
  // A bin whose median residual dips below its predecessor is clamped up, so
  // that t + R(t) stays strictly increasing and therefore invertible.
  const dipping = [];
  for (let t = 0; t <= 600; t += 10) {
    const r = t < 240 ? t / 100 : 0; // residual collapses to 0 from bin 2 on
    dipping.push({
      _T: "LogPlayerPosition",
      _D: new Date((EPOCH + t + r) * 1000).toISOString(),
      common: { isGame: 1 },
      elapsedTime: t,
      character: { accountId: "account.me" },
    });
  }
  const clock = buildMatchClock(dipping);
  assert.ok(clock.residualBins.length >= 2);
  for (let i = 1; i < clock.residualBins.length; i += 1) {
    assert.ok(
      clock.residualBins[i].r >= clock.residualBins[i - 1].r,
      `bin ${i} residual ${clock.residualBins[i].r} dropped below ${clock.residualBins[i - 1].r}`,
    );
  }
});

test("exposes one residual bin per 120 s of match time", () => {
  const clock = buildMatchClock(drifting);
  // elapsed 0..1200 inclusive spans 11 bins: 0-119, 120-239, ... 1200-1319.
  assert.equal(clock.residualBins.length, 11);
  assert.ok(clock.residualBins.every((b) => Number.isFinite(b.t) && Number.isFinite(b.r)));
});

test("degenerate inputs never throw and stay usable", () => {
  for (const input of [null, undefined, [], [{}], [{ _T: "LogPlayerPosition" }]]) {
    const clock = buildMatchClock(input);
    assert.equal(typeof clock.timeOf, "function");
    assert.deepEqual(clock.residualBins, []);
    assert.equal(clock.timeOf({ _T: "LogPlayerKillV2", _D: wallAt(10) }), null);
  }
});
