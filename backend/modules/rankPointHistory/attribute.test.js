const { test } = require("node:test");
const assert = require("node:assert/strict");
const { attributeRankPoints } = require("./attribute");
const { readRankedSnapshot, applyReading } = require("./reading");

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-08-26T18:00:00Z");

const snap = (rankPoint, roundsPlayed, firstSeenAt, lastSeenAt = firstSeenAt, tier = "Gold") => ({
  rankPoint, roundsPlayed, tier, modes: {}, firstSeenAt, lastSeenAt,
});
const match = (id, createdAt, matchType = "competitive") => ({
  id, createdAt: new Date(createdAt).toISOString(), matchType,
});
const run = (series, items) => attributeRankPoints({ series, matches: { summary: { total: items.length }, items } });
const deltaOf = (result, id) => result.items.find((item) => item.id === id).rpDelta;

test("a lone reading gives noBaseline before it and pending after it", () => {
  const result = run([snap(3000, 100, T0)], [match("before", T0 - H), match("at", T0), match("after", T0 + H)]);
  assert.deepEqual(deltaOf(result, "before"), { kind: "noBaseline" });
  assert.deepEqual(deltaOf(result, "at"), { kind: "noBaseline" });
  assert.deepEqual(deltaOf(result, "after"), { kind: "pending" });
  assert.equal(result.summary.rankPoints, null);
  assert.equal(result.summary.total, 3, "existing summary fields survive");
});

test("exactly one ranked match between two readings gets the exact delta", () => {
  const result = run([snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)], [match("m", T0 + H)]);
  assert.deepEqual(deltaOf(result, "m"), { kind: "exact", value: 23 });
  assert.equal(result.summary.rankPoints, null, "an exact newest span needs no header line");
});

test("a loss is a negative exact value", () => {
  const result = run([snap(3000, 100, T0), snap(2985, 101, T0 + 3 * H)], [match("m", T0 + H)]);
  assert.deepEqual(deltaOf(result, "m"), { kind: "exact", value: -15 });
});

test("several ranked matches between two readings form a group and a header summary", () => {
  const result = run(
    [snap(3000, 100, T0), snap(3037, 103, T0 + 3 * H)],
    [match("a", T0 + 1 * H), match("b", T0 + 1.5 * H), match("c", T0 + 2 * H)]
  );
  ["a", "b", "c"].forEach((id) => assert.deepEqual(deltaOf(result, id), { kind: "group", value: 37, matches: 3 }));
  assert.deepEqual(result.summary.rankPoints, { kind: "group", value: 37, matches: 3, since: T0 });
});

test("RP moving with no ranked matches is an adjustment in the header only", () => {
  const result = run([snap(3200, 100, T0), snap(3100, 100, T0 + 3 * H)], [match("normal", T0 + H, "official")]);
  assert.equal(deltaOf(result, "normal"), null);
  assert.deepEqual(result.summary.rankPoints, { kind: "adjustment", value: -100, matches: 0, since: T0 });
});

test("identical consecutive readings produce nothing", () => {
  const result = run([snap(3000, 100, T0), snap(3000, 100, T0 + H)], []);
  assert.equal(result.summary.rankPoints, null);
  assert.deepEqual(result.items, []);
});

test("normal matches never count as candidates and get a null delta", () => {
  const result = run(
    [snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)],
    [match("ranked", T0 + H), match("normal", T0 + 1.5 * H, "official"), match("custom", T0 + 2 * H, "custom")]
  );
  assert.deepEqual(deltaOf(result, "ranked"), { kind: "exact", value: 23 });
  assert.equal(deltaOf(result, "normal"), null);
  assert.equal(deltaOf(result, "custom"), null);
});

test("a match seen while the previous values were re-observed belongs to the next change", () => {
  // reading unchanged at T0 and T0+1H (lastSeenAt), match appeared at T0+30m, change seen at T0+2H
  const result = run([snap(3000, 100, T0, T0 + H), snap(3023, 101, T0 + 2 * H)], [match("m", T0 + 0.5 * H)]);
  assert.deepEqual(deltaOf(result, "m"), { kind: "exact", value: 23 });
});

test("a match newer than the current values' first sighting is pending", () => {
  const result = run([snap(3000, 100, T0), snap(3023, 101, T0 + H, T0 + 3 * H)], [match("m", T0 + 2 * H)]);
  assert.deepEqual(deltaOf(result, "m"), { kind: "pending" });
});

test("a competitive match without a parsable time is unattributed", () => {
  const result = run([snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)], [{ id: "bad", createdAt: null, matchType: "competitive" }]);
  assert.deepEqual(deltaOf(result, "bad"), { kind: "unattributed" });
});

test("an empty series marks competitive rows noBaseline and leaves the rest null", () => {
  const result = run([], [match("r", T0), match("n", T0, "official")]);
  assert.deepEqual(deltaOf(result, "r"), { kind: "noBaseline" });
  assert.equal(deltaOf(result, "n"), null);
  assert.equal(result.summary.rankPoints, null);
});

test("does not mutate its inputs", () => {
  const series = [snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)];
  const items = [match("m", T0 + H)];
  const frozenItem = JSON.stringify(items[0]);
  run(series, items);
  assert.equal(JSON.stringify(items[0]), frozenItem);
  assert.equal(Object.prototype.hasOwnProperty.call(items[0], "rpDelta"), false);
});

const { DECAY_WINDOW_MS } = require("./attribute");
const DAY = 24 * H;

test("merges forward when a match is visible before the ranked endpoint counted it", () => {
  // interval 1: 2 matches visible, 1 counted; interval 2: 0 visible, 1 counted → one merged group
  const result = run(
    [snap(3000, 100, T0), snap(3023, 101, T0 + H), snap(3030, 102, T0 + 2 * H)],
    [match("a", T0 + 20 * 60 * 1000), match("b", T0 + 40 * 60 * 1000)]
  );
  assert.deepEqual(deltaOf(result, "a"), { kind: "group", value: 30, matches: 2 });
  assert.deepEqual(deltaOf(result, "b"), { kind: "group", value: 30, matches: 2 });
  assert.deepEqual(result.summary.rankPoints, { kind: "group", value: 30, matches: 2, since: T0 });
});

test("a merged span that resolves to one counted match is exact", () => {
  // interval 1: 1 visible, 0 counted (RP lagged); interval 2: 0 visible, 1 counted
  const result = run(
    [snap(3000, 100, T0), snap(3000, 100, T0 + H), snap(3023, 101, T0 + 2 * H)],
    [match("m", T0 + 0.5 * H)]
  );
  assert.deepEqual(deltaOf(result, "m"), { kind: "exact", value: 23 });
});

test("a truncated window reports the counted total even when fewer matches are visible", () => {
  // oldest visible match is newer than the window start → matches may hide beyond the visible 8
  const result = run(
    [snap(3000, 100, T0), snap(3037, 110, T0 + 5 * H)],
    [match("a", T0 + 3 * H), match("b", T0 + 3.5 * H), match("c", T0 + 4 * H)]
  );
  ["a", "b", "c"].forEach((id) => assert.deepEqual(deltaOf(result, id), { kind: "group", value: 37, matches: 10 }));
  assert.deepEqual(result.summary.rankPoints, { kind: "group", value: 37, matches: 10, since: T0 });
});

test("a complete window with fewer visible than counted matches stays unattributed", () => {
  // a normal match older than the window proves the window is fully visible
  const result = run(
    [snap(3000, 100, T0), snap(3037, 102, T0 + 5 * H)],
    [match("older-normal", T0 - H, "official"), match("m", T0 + H)]
  );
  assert.deepEqual(deltaOf(result, "m"), { kind: "unattributed" });
  assert.equal(result.summary.rankPoints, null);
});

test("more visible than counted matches with nothing to merge into is unattributed", () => {
  const result = run([snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)], [match("a", T0 + H), match("b", T0 + 2 * H)]);
  assert.deepEqual(deltaOf(result, "a"), { kind: "unattributed" });
  assert.deepEqual(deltaOf(result, "b"), { kind: "unattributed" });
  assert.equal(result.summary.rankPoints, null);
});

test("Diamond and Master never get an exact value across a window longer than the decay threshold", () => {
  const diamond = run(
    [snap(3200, 100, T0, T0, "Diamond"), snap(3223, 101, T0 + DECAY_WINDOW_MS + DAY, T0 + DECAY_WINDOW_MS + DAY, "Diamond")],
    [match("m", T0 + 2 * DAY)]
  );
  assert.deepEqual(deltaOf(diamond, "m"), { kind: "unattributed" });

  const master = run(
    [snap(3500, 100, T0, T0, "Master"), snap(3523, 101, T0 + 8 * DAY, T0 + 8 * DAY, "Master")],
    [match("m", T0 + 2 * DAY)]
  );
  assert.deepEqual(deltaOf(master, "m"), { kind: "unattributed" });
});

test("Crystal and Survivor are also decay-prone tiers across a window longer than the decay threshold", () => {
  const crystal = run(
    [snap(3200, 100, T0, T0, "Crystal"), snap(3223, 101, T0 + DECAY_WINDOW_MS + DAY, T0 + DECAY_WINDOW_MS + DAY, "Crystal")],
    [match("m", T0 + 2 * DAY)]
  );
  assert.deepEqual(deltaOf(crystal, "m"), { kind: "unattributed" });

  const survivor = run(
    [snap(3500, 100, T0, T0, "Survivor"), snap(3523, 101, T0 + 8 * DAY, T0 + 8 * DAY, "Survivor")],
    [match("m", T0 + 2 * DAY)]
  );
  assert.deepEqual(deltaOf(survivor, "m"), { kind: "unattributed" });
});

test("lower tiers keep exact values across long windows", () => {
  const result = run(
    [snap(2000, 100, T0, T0, "Gold"), snap(2023, 101, T0 + 8 * DAY, T0 + 8 * DAY, "Gold")],
    [match("m", T0 + 2 * DAY)]
  );
  assert.deepEqual(deltaOf(result, "m"), { kind: "exact", value: 23 });
});

test("a long idle Diamond drop with no matches is still an adjustment", () => {
  const result = run([snap(3200, 100, T0, T0, "Diamond"), snap(3000, 100, T0 + 9 * DAY, T0 + 9 * DAY, "Diamond")], []);
  assert.deepEqual(result.summary.rankPoints, { kind: "adjustment", value: -200, matches: 0, since: T0 });
});

test("a window measured from the last sighting, not the first, decides the decay rule", () => {
  // first seen 10 days ago, but re-observed unchanged yesterday → 1-day window → exact
  const result = run(
    [snap(3200, 100, T0 - 10 * DAY, T0 - DAY, "Diamond"), snap(3223, 101, T0, T0, "Diamond")],
    [match("m", T0 - 0.5 * DAY)]
  );
  assert.deepEqual(deltaOf(result, "m"), { kind: "exact", value: 23 });
});

test("a null RP reading (modes disagree) makes every span touching it unattributed", () => {
  const result = run(
    [snap(3000, 100, T0), snap(null, 101, T0 + H), snap(3040, 102, T0 + 2 * H)],
    [match("a", T0 + 0.5 * H), match("b", T0 + 1.5 * H)]
  );
  assert.deepEqual(deltaOf(result, "a"), { kind: "unattributed" });
  assert.deepEqual(deltaOf(result, "b"), { kind: "unattributed" });
  assert.equal(result.summary.rankPoints, null);
});

test("only the newest span feeds the header; older groups stay on their rows", () => {
  const result = run(
    [snap(3000, 100, T0), snap(3012, 102, T0 + 2 * H), snap(3035, 103, T0 + 4 * H)],
    [match("old-a", T0 + 0.5 * H), match("old-b", T0 + H), match("new", T0 + 3 * H)]
  );
  assert.deepEqual(deltaOf(result, "old-a"), { kind: "group", value: 12, matches: 2 });
  assert.deepEqual(deltaOf(result, "old-b"), { kind: "group", value: 12, matches: 2 });
  assert.deepEqual(deltaOf(result, "new"), { kind: "exact", value: 23 });
  assert.equal(result.summary.rankPoints, null);
});

test("a duplicate reading from a second instance still reports the group total", () => {
  // two instances can insert the same values; the trailing 0/0 span means nothing happened
  const result = run(
    [snap(3000, 100, T0), snap(3037, 103, T0 + 3 * H), snap(3037, 103, T0 + 3 * H + 60000)],
    [match("a", T0 + 1 * H), match("b", T0 + 1.5 * H), match("c", T0 + 2 * H)]
  );
  ["a", "b", "c"].forEach((id) => assert.deepEqual(deltaOf(result, id), { kind: "group", value: 37, matches: 3 }));
  assert.deepEqual(result.summary.rankPoints, { kind: "group", value: 37, matches: 3, since: T0 });
});

test("does not mutate the snapshots it is given", () => {
  const series = [snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)];
  const frozen = JSON.stringify(series);
  run(series, [match("m", T0 + H)]);
  assert.equal(JSON.stringify(series), frozen);
});

test("summary.since reports the start of the window, not when the baseline was first seen", () => {
  // baseline first seen at T0 but re-observed unchanged until T0+2H: the change
  // can only have happened after the last sighting, so that is the honest start.
  const result = run(
    [snap(3000, 100, T0, T0 + 2 * H), snap(3037, 103, T0 + 5 * H)],
    [match("a", T0 + 3 * H), match("b", T0 + 3.5 * H), match("c", T0 + 4 * H)]
  );
  assert.deepEqual(result.summary.rankPoints, { kind: "group", value: 37, matches: 3, since: T0 + 2 * H });
});

test("the decay guard fires on the lowercase tier the ranked mapper actually produces", () => {
  // extractRankedInfo (ranked.js) always lowercases tier, so readRankedSnapshot stores "diamond",
  // never "Diamond" — this seam was untested and the decay guard never fired in production.
  const rankedInfo = { tier: "diamond", subTier: "3" };
  const reading1 = readRankedSnapshot(
    { "squad-fpp": { currentTier: { tier: "Diamond", subTier: "3" }, currentRankPoint: 3200, roundsPlayed: 100 } },
    rankedInfo
  );
  const reading2 = readRankedSnapshot(
    { "squad-fpp": { currentTier: { tier: "Diamond", subTier: "3" }, currentRankPoint: 3223, roundsPlayed: 101 } },
    rankedInfo
  );
  let series = applyReading([], reading1, T0);
  series = applyReading(series, reading2, T0 + 8 * DAY);

  const result = run(series, [match("m", T0 + 2 * DAY)]);
  assert.deepEqual(deltaOf(result, "m"), { kind: "unattributed" });
});
