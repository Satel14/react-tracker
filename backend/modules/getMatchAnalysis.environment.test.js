const { test } = require("node:test");
const assert = require("node:assert/strict");

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
const me = { accountId: "account.me", name: "Me", teamId: 10 };
const foe = { accountId: "account.foe", name: "Foe", teamId: 20 };

const telemetry = [
  { _T: "LogMatchStart", characters: [{ character: me }] },
  { _T: "LogArmorDestroy", attacker: me, victim: foe, item: { itemId: "Item_Armor_D_01_Lv2_C" } },
  { _T: "LogArmorDestroy", attacker: foe, victim: me, item: { itemId: "Item_Head_G_01_Lv3_C" } },
  { _T: "LogVehicleDamage", attacker: me, damage: 88, vehicle: { vehicleId: "BP_CoupeRB_C" } },
  { _T: "LogObjectInteraction", character: me, objectType: "Door", objectTypeStatus: "Opening" },
  { _T: "LogObjectDestroy", character: me, objectType: "Window" },
  { _T: "LogVaultStart", character: me, isLedgeGrab: false },
];

test("the analysis payload carries the environment counts, from both armour sides", async () => {
  bundle = { matchShard: "steam", matchAttributes, matchPayload, telemetry };
  const result = await getMatchAnalysis({ shard: "steam", matchId: "env-1", accountId: "account.me" });

  assert.deepEqual(result.environment.armourBroke, [{ level: 2, count: 1 }]);
  assert.deepEqual(result.environment.armourLost, [{ level: 3, count: 1 }]);
  assert.equal(result.environment.vehicleDamage, 88);
  assert.equal(result.environment.doorsOpened, 1);
  assert.equal(result.environment.windows, 1);
  assert.equal(result.environment.vaults, 1);
});
