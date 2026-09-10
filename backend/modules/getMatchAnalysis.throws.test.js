const { test } = require("node:test");
const assert = require("node:assert/strict");

// Same stubbing shape as getMatchAnalysis.cache.test.js: replace the bundle
// loader before the module under test requires it, so the payload can be
// asserted for real rather than by reading the source.
const matchLoader = require("./matchLoader");
let bundle = null;
matchLoader.loadMatchBundle = async () => bundle;
delete require.cache[require.resolve("./getMatchAnalysis")];
const { getMatchAnalysis } = require("./getMatchAnalysis");

const matchAttributes = { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" };
const matchPayload = {
  data: { attributes: matchAttributes },
  included: [
    { type: "participant", id: "p1", attributes: { stats: { playerId: "account.me", name: "Me", kills: 1, damageDealt: 100 } } },
    { type: "roster", id: "r1", attributes: { won: "true", stats: { rank: 1, teamId: 10 } }, relationships: { participants: { data: [{ id: "p1" }] } } },
  ],
};

const actor = (accountId, name, x = 100000, y = 100000) => ({
  accountId, name, teamId: 10, health: 100, location: { x, y, z: 0 },
  isInBlueZone: false, isInVehicle: false, isDBNO: false,
});

const telemetry = [
  { _T: "LogMatchStart", characters: [{ character: { accountId: "account.me", name: "Me", teamId: 10 } }] },
  // Two frags of mine, one of which damaged somebody, plus a smoke.
  { _T: "LogPlayerUseThrowable", elapsedTime: 30, attackId: 1,
    attacker: actor("account.me", "Me"), weapon: { itemId: "Item_Weapon_Grenade_C" } },
  { _T: "LogPlayerTakeDamage", elapsedTime: 31, attackId: 1, damage: 55,
    attacker: actor("account.me", "Me"), victim: actor("account.foe", "Foe", 104200, 100000),
    damageTypeCategory: "Damage_Explosion_Grenade", damageCauserName: "ProjGrenade_C" },
  { _T: "LogPlayerUseThrowable", elapsedTime: 40, attackId: 2,
    attacker: actor("account.me", "Me"), weapon: { itemId: "Item_Weapon_Grenade_C" } },
  { _T: "LogPlayerUseThrowable", elapsedTime: 50, attackId: 3,
    attacker: actor("account.me", "Me"), weapon: { itemId: "Item_Weapon_SmokeBomb_C" } },
  // Somebody else's frag must not land in my counts.
  { _T: "LogPlayerUseThrowable", elapsedTime: 60, attackId: 4,
    attacker: actor("account.foe", "Foe", 500000, 500000), weapon: { itemId: "Item_Weapon_Grenade_C" } },
  { _T: "LogPlayerTakeDamage", elapsedTime: 61, attackId: 4, damage: 90,
    attacker: actor("account.foe", "Foe"), victim: actor("account.me", "Me"),
    damageTypeCategory: "Damage_Explosion_Grenade", damageCauserName: "ProjGrenade_C" },
];

test("the analysis payload carries the focal player's own throw counts", async () => {
  // The Damage tab renders this block, and it waits on THIS payload -- the
  // replay payload is heavier and loads separately, so reading throws from
  // there would make the block appear late.
  bundle = { matchShard: "steam", matchAttributes, matchPayload, telemetry };
  const result = await getMatchAnalysis({ shard: "steam", matchId: "throws-1", accountId: "account.me" });

  assert.equal(result.throws.totalThrown, 3, "the enemy frag must not be counted");
  assert.equal(result.throws.totalDamage, 55, "only my own frag's damage");
  assert.deepEqual(
    result.throws.used.map((u) => [u.name, u.count, u.damaging, u.damage]),
    [["Frag Grenade", 2, true, 55], ["Smoke Bomb", 1, false, 0]]
  );
});

test("grenade damage never exceeds the dealt total it is quoted against", async () => {
  // The panel prints "of your N damage, grenades dealt M". parseDamage keeps
  // Damage_Explosion, so M is inside N by construction -- and if the attackId
  // join ever picked up another player's damage, this is what would catch it.
  bundle = { matchShard: "steam", matchAttributes, matchPayload, telemetry };
  const result = await getMatchAnalysis({ shard: "steam", matchId: "throws-2", accountId: "account.me" });

  assert.ok(
    result.throws.totalDamage <= result.damage.dealt.total,
    `grenades ${result.throws.totalDamage} > dealt ${result.damage.dealt.total}`
  );
});
