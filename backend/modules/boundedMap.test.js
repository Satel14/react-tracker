const { test } = require("node:test");
const assert = require("node:assert/strict");
const { BoundedMap } = require("./boundedMap");

test("stops at its ceiling instead of growing", () => {
  const map = new BoundedMap(3);
  for (let i = 0; i < 100; i += 1) map.set(`k${i}`, i);
  assert.equal(map.size, 3);
});

test("the oldest entry is the one dropped", () => {
  const map = new BoundedMap(2);
  map.set("a", 1);
  map.set("b", 2);
  map.set("c", 3);
  assert.deepEqual([...map.keys()], ["b", "c"]);
});

test("below the ceiling nothing is evicted", () => {
  const map = new BoundedMap(10);
  for (let i = 0; i < 10; i += 1) map.set(`k${i}`, i);
  assert.equal(map.size, 10);
  assert.equal(map.get("k0"), 0);
});

test("rewriting a key does not count against the ceiling twice", () => {
  const map = new BoundedMap(2);
  for (let i = 0; i < 50; i += 1) map.set("one", i);
  assert.equal(map.size, 1);
  assert.equal(map.get("one"), 49);
});

// It is a Map, and every call site treats it as one.
test("it still behaves as a Map everywhere else", () => {
  const map = new BoundedMap(5);
  map.set("a", 1);
  assert.equal(map.has("a"), true);
  assert.equal(map.get("missing"), undefined);
  map.delete("a");
  assert.equal(map.size, 0);
  map.set("b", 2);
  map.clear();
  assert.equal(map.size, 0);
  assert.ok(map instanceof Map);
});
