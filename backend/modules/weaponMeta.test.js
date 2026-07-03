const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  readableWeaponName,
  weaponCategory,
  telemetryWeaponName,
  telemetryWeaponCategory,
} = require("./weaponMeta");

test("readableWeaponName maps Item_Weapon_* ids and falls back", () => {
  assert.equal(readableWeaponName("Item_Weapon_AK47_C"), "AKM");
  assert.equal(readableWeaponName("Item_Weapon_Unknown9000_C"), "Unknown9000");
  assert.equal(readableWeaponName(null), "Unknown");
});

test("telemetryWeaponName bridges Weap*_C telemetry names to labels", () => {
  assert.equal(telemetryWeaponName("WeapAK47_C"), "AKM");
  assert.equal(telemetryWeaponName("WeapHK416_C"), "M416");
  assert.equal(telemetryWeaponName("WeapKar98k_C"), "Kar98k");
  assert.equal(telemetryWeaponName("WeapSCAR-L_C"), "Scar-L");
});

test("telemetryWeaponName prettifies non-weapon causers", () => {
  assert.equal(telemetryWeaponName("Buff_DamageBluezone_C"), "Damage Bluezone");
  assert.equal(telemetryWeaponName(null), "Unknown");
});

test("telemetryWeaponCategory resolves category via the bridge", () => {
  assert.equal(telemetryWeaponCategory("WeapAK47_C"), "ar");
  assert.equal(weaponCategory("Item_Weapon_Kar98k_C"), "sr");
});
