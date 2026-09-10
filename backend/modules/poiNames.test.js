const { test } = require("node:test");
const assert = require("node:assert/strict");
const { poiName, POI_NAMES } = require("./poiNames");

// Every nested pair observed in live telemetry (6 matches, 4 maps, 2026-09-10),
// with the answer the last-known-entry rule has to produce. zone is NOT a
// hierarchy -- 9thEventSpot spans 3.3 km and is an event-mode overlay, not a
// place -- so the rule cannot just take position 0.
const REAL_NESTED = [
  [["9thEventSpot", "stadium"], "Stadium"],
  [["truckstop", "GDTruckStop"], "Truck Stop"],
  [["neoxfactory", "testtrack"], "Test Track"],
];

test("resolves every nested pair seen in real telemetry", () => {
  REAL_NESTED.forEach(([zone, expected]) => {
    assert.equal(poiName(zone), expected, JSON.stringify(zone));
  });
});

test("names a single zone", () => {
  assert.equal(poiName(["terminal"]), "Terminal");
  assert.equal(poiName(["hosanprison"]), "Hosan Prison");
  assert.equal(poiName(["sosnovkamilitarybase"]), "Sosnovka Military Base");
});

test("matches a slug whatever its case", () => {
  // GDTruckStop is the one camelCase slug PUBG ships; the table is keyed lower.
  assert.equal(poiName(["GDTruckStop"]), "Truck Stop");
  assert.equal(poiName(["TERMINAL"]), "Terminal");
});

test("returns null rather than guessing at an unknown slug", () => {
  // The whole point of the allow-list: a name we cannot spell correctly is not
  // shown at all. Title-casing would turn "ferrypier" into "Ferrypier".
  assert.equal(poiName(["someplacewehavenotmapped"]), null);
});

test("refuses to name a kill after an event-mode overlay", () => {
  // These two are real slugs the probe reports as missing, and they must STAY
  // missing: they span kilometres (3.3 km measured on Rondo), so they name a
  // third of the map rather than a place.
  assert.equal(poiName(["9thEventSpot"]), null);
  assert.equal(poiName(["8theventspot"]), null);
});

test("skips unknown entries and takes the last one it does know", () => {
  assert.equal(poiName(["terminal", "somethingunknown"]), "Terminal");
  assert.equal(poiName(["somethingunknown", "terminal"]), "Terminal");
});

test("treats an absent zone as no place, never as a throw", () => {
  [[], ["None"], ["", "  "], null, undefined, "terminal", 42, {}, [null, 7]].forEach((value) => {
    assert.equal(poiName(value), null, JSON.stringify(value));
  });
});

test("the table itself is well formed", () => {
  const entries = Object.entries(POI_NAMES);
  assert.ok(entries.length >= 76, `expected the harvested table, got ${entries.length} entries`);
  entries.forEach(([slug, name]) => {
    assert.equal(slug, slug.toLowerCase(), `slug ${slug} must be lowercase`);
    assert.equal(typeof name, "string");
    assert.equal(name, name.trim(), `name ${JSON.stringify(name)} must be trimmed`);
    assert.ok(name.length > 0, `slug ${slug} has an empty name`);
  });
});
