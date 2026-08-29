const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseTimeline, parseKillFeed } = require("./getMatchAnalysis");
const { canonicalWeaponKey, readableWeaponName, telemetryWeaponName, weaponCategory } = require("./weaponMeta");

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

test("canonicalWeaponKey folds the case-mismatched Famas pair onto one label and category", () => {
  const fromItemId = canonicalWeaponKey("Item_Weapon_FAMASG2_C");
  const fromTelemetry = canonicalWeaponKey("WeapFamasG2_C");
  assert.equal(fromItemId, fromTelemetry);
  assert.equal(readableWeaponName(fromItemId), "Famas");
  assert.equal(weaponCategory(fromItemId), "ar");
});

const famasTimeline = [
  { _T: "LogPlayerAttack", elapsedTime: 1, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_FAMASG2_C" }, fireWeaponStackCount: 1 },
  { _T: "LogPlayerAttack", elapsedTime: 2, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_FAMASG2_C" }, fireWeaponStackCount: 2 },
  { _T: "LogPlayerAttack", elapsedTime: 3, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_FAMASG2_C" }, fireWeaponStackCount: 3 },
  { _T: "LogPlayerAttack", elapsedTime: 4, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_FAMASG2_C" }, fireWeaponStackCount: 4 },
  { _T: "LogPlayerTakeDamage", elapsedTime: 3, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 30, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapFamasG2_C" },
  { _T: "LogPlayerTakeDamage", elapsedTime: 4, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 30, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapFamasG2_C" },
];

test("parseTimeline joins Famas shots and hits on one row with a real accuracy percentage", () => {
  const tl = parseTimeline(famasTimeline, { matchStartMs: 0, accountId: "account.me" });
  const rows = tl.accuracy.filter((a) => a.shots > 0 || a.hits > 0);
  assert.equal(rows.length, 1); // was Famas 4/0/0% + FamasG2 0/2/0% before the fix
  assert.equal(rows[0].weapon, "Famas");
  assert.equal(rows[0].shots, 4);
  assert.equal(rows[0].hits, 2);
  assert.equal(rows[0].pct, 50);
});

// Case-folding alone can't join PanzerFaust: the direct-hit causer carries a
// trailing "1" (WeapPanzerFaust100M1_C) and the splash causer isn't Weap-prefixed
// at all (PanzerFaust100M_Projectile_C), so both need an explicit alias.
test("canonicalWeaponKey aliases both PanzerFaust telemetry causers to the canonical item key", () => {
  const canonical = "Item_Weapon_PanzerFaust100M_C";
  assert.equal(canonicalWeaponKey(canonical), canonical);
  assert.equal(canonicalWeaponKey("WeapPanzerFaust100M1_C"), canonical);
  assert.equal(canonicalWeaponKey("PanzerFaust100M_Projectile_C"), canonical);
});

const panzerTimeline = [
  { _T: "LogPlayerAttack", elapsedTime: 1, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_PanzerFaust100M_C" }, fireWeaponStackCount: 1 },
  { _T: "LogPlayerTakeDamage", elapsedTime: 2, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 60, damageCauserName: "WeapPanzerFaust100M1_C" },
  { _T: "LogPlayerTakeDamage", elapsedTime: 2, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.bystander", name: "Bystander" }, damage: 40, damageCauserName: "PanzerFaust100M_Projectile_C" },
];

test("parseTimeline joins both PanzerFaust splash causers onto the single shot row", () => {
  const tl = parseTimeline(panzerTimeline, { matchStartMs: 0, accountId: "account.me" });
  const rows = tl.accuracy.filter((a) => a.shots > 0 || a.hits > 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weapon, "PanzerFaust");
  assert.equal(rows[0].shots, 1);
  assert.equal(rows[0].hits, 2);
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

// Vehicles and fire debuffs only ever appear in LogPlayerTakeDamage, never LogPlayerAttack.
const nonFirearmTimeline = [
  attack("Item_Weapon_HK416_C", 1, 1),
  { _T: "LogPlayerTakeDamage", elapsedTime: 1, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 30, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
  { _T: "LogPlayerTakeDamage", elapsedTime: 5, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe2", name: "Foe2" }, damage: 45, damageTypeCategory: "Damage_VehicleHit", damageCauserName: "Dacia_A_03_v2_Esports_C" },
  { _T: "LogPlayerTakeDamage", elapsedTime: 8, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe3", name: "Foe3" }, damage: 10, damageTypeCategory: "Damage_Burning", damageCauserName: "BP_MolotovFireDebuff_C" },
];

test("parseTimeline drops vehicle and fire-debuff causers from accuracy rows but keeps the fired gun's row", () => {
  const tl = parseTimeline(nonFirearmTimeline, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(tl.accuracy.length, 1);
  assert.equal(tl.accuracy[0].weapon, "M416");
  assert.equal(tl.accuracy[0].shots, 1);
  assert.equal(tl.accuracy[0].hits, 1);
  const dealtWeapons = tl.events.filter((e) => e.kind === "dealt").map((e) => e.weapon);
  assert.ok(dealtWeapons.includes(telemetryWeaponName("Dacia_A_03_v2_Esports_C")));
  assert.ok(dealtWeapons.includes(telemetryWeaponName("BP_MolotovFireDebuff_C")));
});

// A thrown grenade fires under its item id but damages under ProjGrenade_C.
const grenadeThrowTimeline = [
  attack("Item_Weapon_Grenade_C", 10, 1),
  { _T: "LogPlayerTakeDamage", elapsedTime: 12, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 60, damageTypeCategory: "Damage_Explosion_Grenade", damageCauserName: "ProjGrenade_C" },
];

test("parseTimeline joins a thrown grenade's shots and hits on one row", () => {
  const tl = parseTimeline(grenadeThrowTimeline, { matchStartMs: 0, accountId: "account.me" });
  const rows = tl.accuracy.filter((a) => a.weapon === "Frag Grenade");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].shots, 1);
  assert.equal(rows[0].hits, 1);
  assert.equal(rows[0].pct, 100);
});

test("accuracy row and event log agree on the label when the two sides carry different causers", () => {
  const tl = parseTimeline(grenadeThrowTimeline, { matchStartMs: 0, accountId: "account.me" });
  const row = tl.accuracy.find((a) => a.shots > 0);
  const dealtEvent = tl.events.find((e) => e.kind === "dealt");
  assert.equal(row.weapon, "Frag Grenade");
  assert.equal(row.weapon, dealtEvent.weapon);
});

// The replay tab and these tabs live on one page, so a kill has to carry the
// same timestamp in both. The replay moved onto buildMatchClock; these were
// left on the wall clock, and the gap grows 5-19 s across a match.
//
// Note the fixture: real LogPlayerKillV2 and LogPlayerTakeDamage events carry
// NO top-level elapsedTime -- only LogPlayerPosition does. Every other fixture
// in this file attaches one anyway, which short-circuits the conversion at its
// first line and is why the clock rework landed with no red test here.
test("kill and damage times use the same clock as the replay", () => {
  const iso = (sec) => new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString();
  // Positions put the in-game origin 7 s after createdAt.
  const positions = [0, 10, 20, 30].map((t) => ({
    _T: "LogPlayerPosition",
    _D: iso(t + 7),
    common: { isGame: 1 },
    elapsedTime: t,
    character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 100, y: 100, z: 0 } },
  }));
  const telemetry = [
    { _T: "LogMatchStart", characters: [
      { character: { accountId: "account.me", name: "Me", teamId: 1 } },
      { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
    ] },
    ...positions,
    // _D only, as the real event has.
    { _T: "LogPlayerKillV2", _D: iso(27),
      killer: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 100, y: 100, z: 0 } },
      victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 200, y: 200, z: 0 } } },
  ];
  // 27 s wall clock is 20 s in game. The old clock reported 27.
  const feed = parseKillFeed(telemetry, { accountId: "account.me" });
  assert.equal(feed[0].t, 20);
});
