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
const at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
const me = { accountId: "account.me", name: "Me", teamId: 10 };

const telemetry = [
  { _T: "LogMatchStart", _D: at(0), characters: [{ character: me }] },
  { _T: "LogItemEquip", _D: at(10), character: me, item: { itemId: "Item_Weapon_HK416_C", category: "Weapon", subCategory: "Main" } },
  { _T: "LogItemAttach", _D: at(11), character: me,
    parentItem: { itemId: "Item_Weapon_HK416_C", category: "Weapon", subCategory: "Main" },
    childItem: { itemId: "Item_Attach_Weapon_Upper_Scope6x_C", category: "Attachment", subCategory: "None" } },
  { _T: "LogItemEquip", _D: at(12), character: me, item: { itemId: "Item_Head_F_01_Lv2_C", category: "Equipment", subCategory: "Headgear" } },
  { _T: "LogPlayerKillV2", _D: at(30), victim: me, killer: { accountId: "account.foe", name: "Foe", teamId: 20 } },
  // Post-death teardown, which must not reach the payload.
  { _T: "LogItemUnequip", _D: at(31), character: me, item: { itemId: "Item_Weapon_HK416_C", category: "Weapon", subCategory: "Main" } },
];

test("the analysis payload carries the loadout at the moment of death", async () => {
  bundle = { matchShard: "steam", matchAttributes, matchPayload, telemetry };
  const result = await getMatchAnalysis({ shard: "steam", matchId: "loadout-1", accountId: "account.me" });

  assert.equal(result.loadout.cutoff, "death");
  assert.equal(result.loadout.weapons.length, 1, "the post-death unequip must not apply");
  assert.equal(result.loadout.weapons[0].name, "M416");
  assert.deepEqual(result.loadout.weapons[0].attachments, [{ slot: "Upper", name: "6x Scope" }]);
  assert.deepEqual(result.loadout.armour, [{ slot: "Headgear", key: "Item_Head_F_01_Lv2_C", level: 2 }]);
});
