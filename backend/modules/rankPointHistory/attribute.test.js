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
  // A match created at the very instant of the only reading, with no duration
  // and no survival time recorded, could have been counted into that reading or
  // could still be waiting. Both readings of it are live, so neither is shown.
  assert.deepEqual(deltaOf(result, "at"), { kind: "unattributed" });
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

test("two matches over two single-round intervals are split by the order they ended", () => {
  // Both matches could sit in either interval on time alone, and each interval
  // counted one round. What separates them is that "a" ended before "b", so the
  // only consistent reading is a -> interval 1, b -> interval 2. The older rule
  // merged the pair into one group of 30 here.
  const result = run(
    [snap(3000, 100, T0), snap(3023, 101, T0 + H), snap(3030, 102, T0 + 2 * H)],
    [match("a", T0 + 20 * 60 * 1000), match("b", T0 + 40 * 60 * 1000)]
  );
  assert.deepEqual(deltaOf(result, "a"), { kind: "exact", value: 23 });
  assert.deepEqual(deltaOf(result, "b"), { kind: "exact", value: 7 });
  assert.equal(result.summary.rankPoints, null, "an exact newest span needs no header line");
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

test("an interval that counted more rounds than we can see reports the group total", () => {
  // Two rounds were counted and only one ranked match is visible. The missing
  // one cannot be named, but the total and the count both can be, and saying so
  // beats the older rule's silence.
  const result = run(
    [snap(3000, 100, T0), snap(3037, 102, T0 + 5 * H)],
    [match("older-normal", T0 - H, "official"), match("m", T0 + H)]
  );
  assert.deepEqual(deltaOf(result, "m"), { kind: "group", value: 37, matches: 2 });
  assert.deepEqual(result.summary.rankPoints, { kind: "group", value: 37, matches: 2, since: T0 });
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

// PUBG counts a match only once it has ended, and a match lasts 20-30 minutes.
// Attribution therefore has to place a match by when it ended, not by when it
// started, or a reading taken mid-match is credited with a result it cannot
// yet contain.
const MIN = 60 * 1000;
const playedMatch = (id, createdAt, durationMin = 25) => ({
  id,
  createdAt: new Date(createdAt).toISOString(),
  matchType: "competitive",
  duration: durationMin * 60,
});

test("a match still running when the first reading was taken is not inside that baseline", () => {
  // M1 starts 15:43 and ends 16:08; the first reading is taken 16:00, while it runs.
  // Its RP lands in the 16:30 reading, so every later match must stay attributable.
  const base = Date.parse("2026-09-01T16:00:00Z");
  const result = run(
    [
      snap(3000, 100, base),
      snap(2980, 101, base + 30 * MIN),
      snap(3005, 102, base + 75 * MIN),
      snap(2990, 103, base + 120 * MIN),
    ],
    [
      playedMatch("m1", base - 17 * MIN),
      playedMatch("m2", base + 33 * MIN),
      playedMatch("m3", base + 80 * MIN),
    ]
  );
  assert.deepEqual(deltaOf(result, "m1"), { kind: "exact", value: -20 });
  assert.deepEqual(deltaOf(result, "m2"), { kind: "exact", value: 25 });
  assert.deepEqual(deltaOf(result, "m3"), { kind: "exact", value: -15 });
});

test("a match still running at the last reading is never handed that reading's change", () => {
  // X1 starts 13:58 and ends 14:23, and the last reading is 14:10. Whether the
  // -15 it recorded can be X1's depends on something we cannot observe: PUBG may
  // count a round when the match ends, or when the player dies in it. Under the
  // first, X1 is still pending; under the second, the 14:10 reading may already
  // hold it. The one thing ruled out either way is showing -15 on this row.
  const day = Date.parse("2026-09-01T13:00:00Z");
  const result = run(
    [snap(3000, 100, day, day + 65 * MIN), snap(2985, 101, day + 70 * MIN)],
    [playedMatch("x1", day + 58 * MIN)]
  );
  assert.deepEqual(deltaOf(result, "x1"), { kind: "unattributed" });
});

test("fields the payload arrived with survive annotation", () => {
  // The annotated object replaces matches in the cached payload, so anything it
  // drops here is gone from the cache for that entry's whole lifetime --
  // including the two fields this module itself reads.
  const fetchedAt = T0 + 4 * H;
  const result = attributeRankPoints({
    series: [snap(3000, 100, T0), snap(3023, 101, T0 + 3 * H)],
    matches: { summary: { total: 1 }, items: [match("m", T0 + H)], fetchedAt, complete: true },
  });
  assert.equal(result.fetchedAt, fetchedAt);
  assert.equal(result.complete, true);
  assert.equal(result.summary.total, 1);
});

test("an empty series also preserves the payload's own fields", () => {
  const result = attributeRankPoints({
    series: [],
    matches: { summary: {}, items: [match("m", T0)], fetchedAt: T0, complete: false },
  });
  assert.equal(result.fetchedAt, T0);
  assert.equal(result.complete, false);
});

test("a search too large to finish degrades to one group and says so", () => {
  // Twelve matches that all started before the first interval and none of which
  // has ended, with each later one running longer than the last -- so no pair
  // ends in creation order and the order constraint never fires. Nothing is left
  // to prune with, and the search cannot finish inside its budget.
  const readings = Array.from({ length: 13 }, (_unused, k) => snap(3000 + k, 100 + k, T0 + k * H));
  const items = Array.from({ length: 12 }, (_unused, k) => ({
    id: `m${k}`,
    createdAt: new Date(T0 + (k + 1) * 60 * 1000).toISOString(),
    matchType: "competitive",
    duration: (100 - k) * 3600,
    survivalTime: 0,
  }));
  const logged = [];
  const realLog = console.log;
  console.log = (line) => logged.push(String(line));
  let result;
  try {
    result = attributeRankPoints({ series: readings, matches: { summary: {}, items } });
  } finally {
    console.log = realLog;
  }
  const kinds = new Set(result.items.map((item) => item.rpDelta.kind));
  assert.deepEqual([...kinds], ["group"], "no row may claim an exact value from an unfinished search");
  assert.ok(logged.some((line) => line.includes("[RP] attribution budget exhausted")), "the fallback is visible in the logs");
});
