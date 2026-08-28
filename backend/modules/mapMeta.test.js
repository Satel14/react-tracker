const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getMapMeta, MAP_META } = require("./mapMeta");
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
  // Derived from a real Vikendi match: the first safety zone is centred on the
  // map midpoint at 4080 m, so the side is 8160. The method agrees with the
  // declared value on six other maps; Vikendi was the one that disagreed.
  assert.equal(backendMax, 8160);
});

// Vikendi shipped with the 6120 of its 2019 original while the live map is
// 8x8 km, and no test could see it: mapMax is only ever compared against
// itself. This pins the shape of every entry instead, so a value that is not
// a real PUBG map side fails loudly rather than silently drawing players off
// the map.
test("every mapMax is a real PUBG map side", () => {
  // PUBG ships 1x1, 2x2, 3x3, 4x4, 6x6 and 8x8 km maps. The stored number is
  // metres plus the 2% margin the engine uses (8000 -> 8160).
  const SIDES = new Set([1020, 2040, 3060, 4080, 6120, 8160]);
  for (const [raw, meta] of Object.entries(MAP_META)) {
    assert.ok(
      SIDES.has(meta.mapMax),
      `${raw} has mapMax ${meta.mapMax}, which is not a PUBG map side`
    );
  }
});

test("Vikendi and Erangel share a side, because both are 8x8 km", () => {
  // The regression that prompted the check above: Vikendi was 6120 while every
  // other 8x8 map was 8160.
  assert.equal(MAP_META.DihorOtok_Main.mapMax, MAP_META.Baltic_Main.mapMax);
});
