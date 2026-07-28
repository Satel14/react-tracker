const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseDamage } = require("./getMatchAnalysis");

// Grenade/explosion damage dealt by the focal player to an enemy. The old narrow
// include-list dropped this category entirely.
const explosionTelemetry = [
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 75, damageReason: "None", damageTypeCategory: "Damage_Explosion_Grenade", damageCauserName: "ProjGrenade_C" },
];

test("parseDamage counts grenade/explosion damage toward combat totals", () => {
  const d = parseDamage(explosionTelemetry, { accountId: "account.me" });
  assert.equal(d.dealt.total, 75); // was 0 before the exclude-list fix
  assert.equal(d.dealt.hitCount, 1);
  assert.equal(d.dealtByWeapon[0].damage, 75);
});

// Environmental damage taken by the focal player must still be excluded.
const environmentalTelemetry = [
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "" }, victim: { accountId: "account.me", name: "Me" }, damage: 20, damageReason: "None", damageTypeCategory: "Damage_BlueZone", damageCauserName: "Buff_DamageBluezone_C" },
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "" }, victim: { accountId: "account.me", name: "Me" }, damage: 30, damageReason: "None", damageTypeCategory: "Damage_Explosion_RedZone", damageCauserName: "RedZoneBomb_C" },
];

test("parseDamage still excludes environmental damage (blue zone, red zone)", () => {
  const d = parseDamage(environmentalTelemetry, { accountId: "account.me" });
  assert.equal(d.taken.total, 0);
});

// Real Rondo capture: 55/38/66 by category summed to 159 (bug #8) against
// PUBG's official stats.damageDealt of 103.74; 159 - 55 (vehicle-hit) = 104.
const rondoTelemetry = [
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 55, damageReason: "None", damageTypeCategory: "Damage_VehicleHit", damageCauserName: "BP_Motorglider_C" },
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 38, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 66, damageReason: "None", damageTypeCategory: "Damage_Molotov", damageCauserName: "Molotov_C" },
];

test("parseDamage excludes vehicle-hit damage but keeps molotov (Rondo case: 104)", () => {
  const d = parseDamage(rondoTelemetry, { accountId: "account.me" });
  assert.equal(d.dealt.total, 104);
  const molotov = d.dealtByWeapon.find((w) => w.weaponKey === "Molotov_C");
  assert.ok(molotov, "molotov row must still be present in the per-weapon breakdown");
  assert.equal(molotov.damage, 66);
  const vehicle = d.dealtByWeapon.find((w) => w.weaponKey === "BP_Motorglider_C");
  assert.equal(vehicle, undefined, "vehicle-hit damage must not appear in the per-weapon breakdown");
});
