const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analyseLag } = require("./analyse");

const T = Date.parse("2026-09-02T12:00:00Z");
const MIN = 60 * 1000;

// A poll is one minute's observation: what the ranked counter said, and which
// match ids the player record listed.
const poll = (minute, roundsPlayed, matchIds = [], rankPoint = 2900) => ({
  at: T + minute * MIN,
  rankPoint,
  roundsPlayed,
  matchIds,
});

// durationMin and survivedMin are what PUBG reports, in minutes here for legibility.
const played = (id, startMinute, durationMin = 25, survivedMin = 10, extra = {}) => ({
  id,
  createdAt: new Date(T + startMinute * MIN).toISOString(),
  duration: durationMin * 60,
  timeSurvived: survivedMin * 60,
  matchType: "competitive",
  deathType: "byplayer",
  ...extra,
});

const only = (result, id) => result.matches.find((m) => m.id === id);

test("measures how long after a match ended its round was counted", () => {
  // m1 runs 12:00 to 12:25; the counter moves at the 12:32 poll.
  const result = analyseLag({
    polls: [poll(0, 40), poll(25, 40, ["m1"]), poll(30, 40, ["m1"]), poll(32, 41, ["m1"])],
    matches: [played("m1", 0)],
  });
  const m1 = only(result, "m1");
  assert.equal(m1.countedAt, T + 32 * MIN);
  assert.equal(m1.lagFromEndMs, 7 * MIN);
  assert.equal(m1.lagFromDeathMs, 22 * MIN);
  assert.equal(m1.countedBeforeMatchEnd, false);
  assert.equal(m1.ambiguous, false);
});

test("reports a round counted before the match ended, which would mean PUBG counts at the death", () => {
  // The player died at 12:10; the counter moved at 12:14, eleven minutes before the match ended.
  const result = analyseLag({
    polls: [poll(0, 40), poll(12, 40), poll(14, 41)],
    matches: [played("m1", 0)],
  });
  const m1 = only(result, "m1");
  assert.equal(m1.countedBeforeMatchEnd, true);
  assert.equal(m1.lagFromDeathMs, 4 * MIN);
});

test("marks both matches ambiguous when one poll absorbs two rounds", () => {
  const result = analyseLag({
    polls: [poll(0, 40), poll(70, 42, ["m1", "m2"])],
    matches: [played("m1", 0), played("m2", 30)],
  });
  assert.equal(only(result, "m1").ambiguous, true);
  assert.equal(only(result, "m2").ambiguous, true);
  assert.equal(only(result, "m2").countedAt, T + 70 * MIN, "the poll time is an upper bound");
});

test("leaves a match uncounted when the counter never moves for it", () => {
  // The Update 10.2 waiver: a match that records no stats and no RP change.
  const result = analyseLag({
    polls: [poll(0, 40, []), poll(40, 40, ["m1"]), poll(60, 40, ["m1"])],
    matches: [played("m1", 0, 25, 4, { deathType: "logout" })],
  });
  const m1 = only(result, "m1");
  assert.equal(m1.countedAt, null);
  assert.equal(m1.lagFromEndMs, null);
  assert.equal(m1.listed, true);
});

test("records when the match list showed the match, so list and counter can be ordered", () => {
  const result = analyseLag({
    polls: [poll(0, 40, []), poll(28, 40, ["m1"]), poll(33, 41, ["m1"])],
    matches: [played("m1", 0)],
  });
  const m1 = only(result, "m1");
  assert.equal(m1.firstListedAt, T + 28 * MIN);
  assert.equal(m1.listedBeforeCounted, true);
});

test("ignores matches that are not ranked", () => {
  const result = analyseLag({
    polls: [poll(0, 40), poll(32, 41)],
    matches: [played("normal", 0, 25, 10, { matchType: "official" }), played("m1", 0)],
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].id, "m1");
});

test("summarises the readings a polling rule would have to be built on", () => {
  const result = analyseLag({
    polls: [poll(0, 40), poll(32, 41), poll(70, 42)],
    matches: [played("m1", 0), played("m2", 33)],
  });
  assert.equal(result.summary.counted, 2);
  assert.equal(result.summary.ambiguous, 0);
  assert.equal(result.summary.countedBeforeMatchEnd, 0);
  assert.equal(result.summary.maxLagFromEndMs, 12 * MIN);
});

test("a match that ended before the first poll is out of range, not uncounted", () => {
  // The counter had already absorbed it before watching began, so its absence
  // says nothing about PUBG and must not be read as a missing round.
  const result = analyseLag({
    polls: [poll(60, 40, ["old"]), poll(70, 40, ["old"])],
    matches: [played("old", 0)],
  });
  const old = only(result, "old");
  assert.equal(old.outOfRange, true);
  assert.equal(old.countedAt, null);
  assert.equal(result.summary.outOfRange, 1);
  assert.equal(result.summary.uncounted, 0, "out-of-range matches are not counted as missing");
});

test("draws no conclusion about when PUBG counts until it has a firm reading", () => {
  const empty = analyseLag({ polls: [poll(0, 40)], matches: [] });
  assert.equal(empty.summary.firm, 0);
  assert.equal(empty.summary.countsAt, null);

  const measured = analyseLag({
    polls: [poll(0, 40), poll(32, 41)],
    matches: [played("m1", 0)],
  });
  assert.equal(measured.summary.firm, 1);
  assert.equal(measured.summary.countsAt, "matchEnd");
});
