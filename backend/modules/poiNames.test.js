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
  assert.ok(entries.length >= 118, `expected the harvested table, got ${entries.length} entries`);
  entries.forEach(([slug, name]) => {
    // Deston ships spaced slugs ("los arcos"), so a key may contain a space;
    // what it may never contain is an upper-case letter, since the lookup
    // lowercases.
    assert.equal(slug, slug.toLowerCase(), `slug ${slug} must be lowercase`);
    assert.equal(typeof name, "string");
    assert.equal(name, name.trim(), `name ${JSON.stringify(name)} must be trimmed`);
    assert.ok(name.length > 0, `slug ${slug} has an empty name`);
    // The kill-feed span is capped at 160px and ellipsises past it. jsdom has no
    // layout, so the width itself cannot be tested -- this budget stands in for
    // it. "Sosnovka Military Base", the current longest at 22, measured 131px.
    assert.ok(name.length <= 24, `name ${JSON.stringify(name)} is too long for the kill-feed row`);
  });
});

test("keys both forms of a slug PUBG ships two ways", () => {
  // Deston is the one measured map that emits a flattened AND a spaced form of
  // the same POI, and either can arrive on a given event. The spaced form is
  // also what tells us where the words break, so nothing is guessed here.
  [
    ["constructionsite", "construction site", "Construction Site"],
    ["elkoro", "el koro", "El Koro"],
    ["hydroelectricdam", "hydroelectric dam", "Hydroelectric Dam"],
  ].forEach(([flat, spaced, name]) => {
    assert.equal(poiName([flat]), name, flat);
    assert.equal(poiName([spaced]), name, spaced);
  });
});

test("handles the Deston slug that is misspelled upstream", () => {
  // "losacros" drops a letter the spaced form keeps, so the two are NOT the
  // same string flattened -- both have to be keyed. Same class of upstream typo
  // as Miramar's "manisgenerales".
  assert.notEqual("los arcos".replace(/ /g, ""), "losacros");
  assert.equal(poiName(["losacros"]), "Los Arcos");
  assert.equal(poiName(["los arcos"]), "Los Arcos");
});

test("leaves a slug whose word break is unconfirmed unnamed", () => {
  // Measured on Vikendi, Sanhok and Deston and deliberately not added: naming
  // them would be guessing where the words break, and a missing name is the
  // accepted failure while a wrong one is not.
  ["laveni", "naros", "dekamesto", "kranik", "lawaki", "banana_01", "sancarna"].forEach((slug) => {
    assert.equal(poiName([slug]), null, slug);
  });
});
