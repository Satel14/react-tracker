const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getMapMeta } = require("./mapMeta");
const fs = require("node:fs");
const path = require("node:path");

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

test("Vikendi (DihorOtok_Main) mapMax stays mirrored across backend and frontend", () => {
  const readVikendiMapMax = (file) => {
    const src = fs.readFileSync(file, "utf8");
    const match = src.match(/DihorOtok_Main:\s*\{[^}]*?mapMax:\s*(\d+)/);
    assert.ok(match, `DihorOtok_Main mapMax not found in ${file}`);
    return Number(match[1]);
  };

  const backendMax = readVikendiMapMax(path.join(__dirname, "mapMeta.js"));
  const frontendMax = readVikendiMapMax(
    path.join(__dirname, "..", "..", "frontend", "src", "helpers", "mapMeta.js")
  );

  assert.equal(
    backendMax,
    frontendMax,
    "backend and frontend Vikendi mapMax must not drift"
  );
  assert.equal(backendMax, 6120);
});
