const { test } = require("node:test");
const assert = require("node:assert/strict");
const { attributeRankPoints } = require("./attribute");

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
