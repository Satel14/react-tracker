const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseMeds } = require("./getMatchAnalysis");

const me = (over = {}) => ({
  name: "Me", accountId: "account.me", teamId: 1, health: 60,
  isInBlueZone: false, isInVehicle: false, isDBNO: false, ...over,
});

const use = (itemId, category, subCategory, character = me()) => ({
  _T: "LogItemUse", character, item: { itemId, category, subCategory, stackCount: 1 },
});

const heal = (itemId, healAmount, character = me()) => ({
  _T: "LogHeal", character, healAmount,
  item: itemId ? { itemId, stackCount: 1 } : { itemId: "", stackCount: 0 },
});

const opts = { accountId: "account.me" };

test("counts Use-category items and ignores ammunition", () => {
  // Ammunition loading is the same event and outnumbers consumables in a real
  // match, so the category filter is what makes this parser mean anything.
  const meds = parseMeds([
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    use("Item_Ammo_556mm_C", "Ammunition", "None"),
    use("Item_Ammo_762mm_C", "Ammunition", "None"),
  ], opts);

  assert.equal(meds.totalUses, 2);
  assert.deepEqual(meds.used.map((u) => [u.name, u.count]), [["Bandage", 2]]);
});

test("sums HP per item type, counting each heal event exactly once", () => {
  const meds = parseMeds([
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    use("Item_Heal_FirstAid_C", "Use", "Heal"),
    heal("Item_Heal_Bandage_C", 4),
    heal("Item_Heal_Bandage_C", 6),
    heal("Item_Heal_FirstAid_C", 47.4),
  ], opts);

  const byName = Object.fromEntries(meds.used.map((u) => [u.name, u.hp]));
  assert.equal(byName.Bandage, 10);
  assert.equal(byName["First Aid Kit"], 47);
  // The two buckets are exclusive. Without this, boostHp collecting every heal
  // event passes every other test here and inflates "boost regen" on real data
  // by the whole of the item-attributed total.
  assert.equal(meds.boostHp, 0);
});

test("two overlapping uses of one item do not double-count its HP", () => {
  // The whole reason HP is per item type and never per use: walking forward
  // from each use to the ticks credited a bandage with 31.5 HP against a real
  // 10, because the windows overlap.
  const meds = parseMeds([
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    heal("Item_Heal_Bandage_C", 10),
    heal("Item_Heal_Bandage_C", 10),
  ], opts);

  assert.equal(meds.used[0].count, 2);
  assert.equal(meds.used[0].hp, 20);
});

test("a boost carries no HP figure, and item-less heal ticks become boostHp", () => {
  const meds = parseMeds([
    use("Item_Boost_EnergyDrink_C", "Use", "Boost"),
    heal(null, 1.5),
    heal(null, 2),
    heal(null, 0),
  ], opts);

  assert.equal(meds.used[0].name, "Energy Drink");
  assert.equal(meds.used[0].kind, "boost");
  assert.equal(meds.used[0].hp, null);
  assert.equal(meds.boostHp, 4);
});

test("anything Use-category that is neither heal nor boost goes to other", () => {
  const meds = parseMeds([
    use("Item_Bluechip_C", "Use", "None"),
    use("Item_EmergencyPickup_C", "Use", "Gadget"),
    use("Item_Heal_Bandage_C", "Use", "Heal"),
  ], opts);

  assert.deepEqual(meds.other.map((o) => [o.name, o.count]), [["Blue Chip", 1], ["Emergency Pickup", 1]]);
  assert.equal(meds.used.length, 1);
  // The denominator the context rows are read against covers everything used.
  assert.equal(meds.totalUses, 3);
});

test("reads the situation off the use event, not from a time window", () => {
  const meds = parseMeds([
    use("Item_Heal_Bandage_C", "Use", "Heal", me({ isInBlueZone: true })),
    use("Item_Heal_Bandage_C", "Use", "Heal", me({ isInVehicle: true })),
    use("Item_Heal_Bandage_C", "Use", "Heal", me({ isInBlueZone: true, isInVehicle: true })),
    use("Item_Heal_Bandage_C", "Use", "Heal"),
  ], opts);

  assert.equal(meds.inBlueZone, 2);
  assert.equal(meds.inVehicle, 2);
  assert.equal(meds.totalUses, 4);
});

test("sorts by count descending then by name", () => {
  const meds = parseMeds([
    use("Item_Boost_EnergyDrink_C", "Use", "Boost"),
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    use("Item_Heal_Bandage_C", "Use", "Heal"),
    use("Item_Heal_FirstAid_C", "Use", "Heal"),
  ], opts);

  assert.deepEqual(meds.used.map((u) => u.name), ["Bandage", "Energy Drink", "First Aid Kit"]);
});

test("ignores another player's consumables", () => {
  const them = me({ name: "Foe", accountId: "account.foe" });
  const meds = parseMeds([
    use("Item_Heal_Bandage_C", "Use", "Heal", them),
    heal("Item_Heal_Bandage_C", 10, them),
    heal(null, 5, them),
  ], opts);

  assert.equal(meds.totalUses, 0);
  assert.deepEqual(meds.used, []);
  assert.equal(meds.boostHp, 0);
});

test("returns an empty, well-shaped result when nothing was used", () => {
  [[], null, undefined, 42, [null, 7]].forEach((value) => {
    const meds = parseMeds(value, opts);
    assert.deepEqual(meds.used, [], JSON.stringify(value));
    assert.deepEqual(meds.other, []);
    assert.equal(meds.totalUses, 0);
    assert.equal(meds.boostHp, 0);
    assert.equal(meds.inBlueZone, 0);
    assert.equal(meds.inVehicle, 0);
  });
});
