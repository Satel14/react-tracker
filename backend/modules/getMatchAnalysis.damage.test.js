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
