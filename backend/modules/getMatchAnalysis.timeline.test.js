const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseTimeline } = require("./getMatchAnalysis");
const { canonicalWeaponKey } = require("./weaponMeta");

// LogPlayerAttack names a gun "Item_Weapon_FooBar_C"; LogPlayerTakeDamage names the
// SAME gun "WeapFooBar_C". For an unmapped weapon the two prettifiers diverge
// ("FooBar" vs "Foo Bar"), so shots and hits land on different rows -> 0% accuracy.
const unmappedTimeline = [
  { _T: "LogPlayerAttack", elapsedTime: 10, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_FooBar_C" }, fireWeaponStackCount: 1 },
  { _T: "LogPlayerAttack", elapsedTime: 12, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_FooBar_C" }, fireWeaponStackCount: 2 },
  { _T: "LogPlayerTakeDamage", elapsedTime: 12, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 30, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapFooBar_C" },
];

test("canonicalWeaponKey collapses Item_Weapon_* and Weap* forms to one key", () => {
  assert.equal(canonicalWeaponKey("Item_Weapon_FooBar_C"), "Item_Weapon_FooBar_C");
  assert.equal(canonicalWeaponKey("WeapFooBar_C"), "Item_Weapon_FooBar_C");
  assert.equal(canonicalWeaponKey(null), null);
});

test("parseTimeline joins shots and hits for an unmapped weapon on a single row", () => {
  const tl = parseTimeline(unmappedTimeline, { matchStartMs: 0, accountId: "account.me" });
  const rows = tl.accuracy.filter((a) => a.shots > 0 || a.hits > 0);
  assert.equal(rows.length, 1); // was 2 before the join fix (0% row + orphan hits row)
  assert.equal(rows[0].shots, 2);
  assert.equal(rows[0].hits, 1);
  assert.equal(rows[0].pct, 50);
});

// One trigger pull, nine pellets land -> raw pct 900%. Must clamp to 100.
const shotgunTimeline = [
  { _T: "LogPlayerAttack", elapsedTime: 5, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_Saiga12_C" }, fireWeaponStackCount: 1 },
  ...Array.from({ length: 9 }, () => ({ _T: "LogPlayerTakeDamage", elapsedTime: 5, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 8, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapSaiga12_C" })),
];

test("parseTimeline clamps per-weapon accuracy at 100% for shotgun pellet spread", () => {
  const tl = parseTimeline(shotgunTimeline, { matchStartMs: 0, accountId: "account.me" });
  const o12 = tl.accuracy.find((a) => a.weapon === "O12");
  assert.equal(o12.shots, 1);
  assert.equal(o12.hits, 9);
  assert.equal(o12.pct, 100); // clamped from 900
});

function attack(itemId, elapsedTime, fireWeaponStackCount) {
  return { _T: "LogPlayerAttack", elapsedTime, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId }, fireWeaponStackCount };
}

test("parseTimeline counts one shot per attack event, not the magazine counter", () => {
  const magazine = Array.from({ length: 21 }, (_, i) => attack("Item_Weapon_AUG_C", i + 1, i + 1));
  const tl = parseTimeline(magazine, { matchStartMs: 0, accountId: "account.me" });
  const aug = tl.accuracy.find((a) => a.weapon === "AUG");
  assert.equal(aug.shots, 21); // summing 1..21 gave 231
  assert.equal(aug.hits, 0);
});

test("parseTimeline counts every shot when a dropped weapon restarts its magazine counter", () => {
  const repicked = [
    attack("Item_Weapon_AK47_C", 1, 1),
    attack("Item_Weapon_AK47_C", 2, 2),
    attack("Item_Weapon_AK47_C", 3, 3),
    attack("Item_Weapon_AK47_C", 40, 1),
    attack("Item_Weapon_AK47_C", 41, 2),
  ];
  const tl = parseTimeline(repicked, { matchStartMs: 0, accountId: "account.me" });
  const akm = tl.accuracy.find((a) => a.weapon === "AKM");
  assert.equal(akm.shots, 5); // summing gave 9; max(counter) would give 3
});

test("parseTimeline ignores attack events with no weapon itemId", () => {
  const withGarbage = [
    attack("", 1, 225321448),
    attack("", 2, 225321448),
    attack("", 3, 0),
    attack("", 4, 514),
    attack("", 5, -1576353776),
    attack("", 6, -1458119584),
    { _T: "LogPlayerAttack", elapsedTime: 7, attacker: { accountId: "account.me", name: "Me" }, weapon: {}, fireWeaponStackCount: 1 },
    attack("Item_Weapon_HK416_C", 8, 1),
    { _T: "LogPlayerTakeDamage", elapsedTime: 8, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 30, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
  ];
  const tl = parseTimeline(withGarbage, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(tl.accuracy.length, 1);
  assert.equal(tl.accuracy[0].weapon, "M416");
  assert.equal(tl.accuracy[0].shots, 1);
  assert.equal(tl.accuracy[0].hits, 1);
  assert.equal(tl.accuracy[0].pct, 100);
});
