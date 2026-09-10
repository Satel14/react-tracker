const { test } = require("node:test");
const assert = require("node:assert/strict");
const { itemName, ITEM_NAMES } = require("./itemNames");

test("names every consumable measured in real matches", () => {
  const cases = [
    ["Item_Heal_Bandage_C", "Bandage"],
    ["Item_Heal_FirstAid_C", "First Aid Kit"],
    ["Item_Heal_MedKit_C", "Med Kit"],
    ["Item_Boost_EnergyDrink_C", "Energy Drink"],
    ["Item_Boost_PainKiller_C", "Painkiller"],
    ["Item_Boost_AdrenalineSyringe_C", "Adrenaline Syringe"],
    ["Item_Bluechip_C", "Blue Chip"],
    ["Item_EmergencyPickup_C", "Emergency Pickup"],
    ["Item_JerryCan_C", "Jerrycan"],
  ];
  cases.forEach(([id, name]) => assert.equal(itemName(id), name, id));
});

test("falls back to splitting the id, because item ids carry word boundaries", () => {
  // The opposite call to POI slugs, which are flattened to lowercase: an item id
  // is camelCase, so splitting it cannot produce "Ferrypier"-class garbage.
  assert.equal(itemName("Item_Heal_SomeNewKit_C"), "Some New Kit");
  assert.equal(itemName("Item_Boost_SuperJuice_C"), "Super Juice");
  assert.equal(itemName("Item_Mountainbike_C"), "Mountainbike");
});

test("handles a doubly-prefixed id", () => {
  // Miramar's house key ships as Item_Desert_Key_C.
  assert.equal(itemName("Item_Desert_Key_C"), "Desert Key");
});

test("returns null rather than an empty label", () => {
  [null, undefined, 42, {}, "", "   ", "Item_", "Item_C"].forEach((value) => {
    assert.equal(itemName(value), null, JSON.stringify(value));
  });
});

test("the table is well formed", () => {
  const entries = Object.entries(ITEM_NAMES);
  assert.ok(entries.length >= 9, `expected the curated table, got ${entries.length}`);
  entries.forEach(([id, name]) => {
    assert.match(id, /^Item_.*_C$/, `${id} is not an item id`);
    assert.equal(name, name.trim(), `${JSON.stringify(name)} must be trimmed`);
    assert.ok(name.length > 0, `${id} has an empty name`);
  });
});
