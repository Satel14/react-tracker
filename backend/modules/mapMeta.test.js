const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getMapMeta } = require("./mapMeta");

test("returns precise mapMax for Erangel variants", () => {
  assert.equal(getMapMeta("Baltic_Main").mapMax, 8160);
  assert.equal(getMapMeta("Erangel_Main").mapMax, 8160);
  assert.equal(getMapMeta("Baltic_Main").displayName, "Erangel");
});

test("returns precise mapMax for smaller maps", () => {
  assert.equal(getMapMeta("Savage_Main").mapMax, 4080);
  assert.equal(getMapMeta("Summerland_Main").mapMax, 2040);
  assert.equal(getMapMeta("Heaven_Main").mapMax, 1020);
});

test("falls back gracefully for unknown maps", () => {
  const meta = getMapMeta("Future_Main");
  assert.equal(meta.mapMax, 8160);
  assert.equal(meta.displayName, "Future");
});
