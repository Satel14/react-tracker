const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildEnvironment } = require("./environment");

const me = { accountId: "account.me", name: "Me", teamId: 1 };
const foe = { accountId: "account.foe", name: "Foe", teamId: 2 };
const opts = { accountId: "account.me" };

const armour = (attacker, victim, itemId) => ({
  _T: "LogArmorDestroy", attacker, victim,
  item: { itemId, category: "Equipment", subCategory: "Vest" },
  damageTypeCategory: "Damage_Gun", damageReason: "TorsoShot",
});
const vehDamage = (attacker, damage) => ({
  _T: "LogVehicleDamage", attacker, damage,
  vehicle: { vehicleId: "BP_CoupeRB_C", healthPercent: 60 },
});
const door = (character, status) => ({
  _T: "LogObjectInteraction", character, objectType: "Door", objectTypeStatus: status,
});
const destroy = (character, objectType) => ({ _T: "LogObjectDestroy", character, objectType });
const vault = (character) => ({ _T: "LogVaultStart", character, isLedgeGrab: false, isVaultOnVehicle: false });

test("counts armour the focal player broke, from the attacker side", () => {
  // The first probe read only the FIRST actor off each event, so a player
  // appearing as attacker was never counted and this came out zero.
  const out = buildEnvironment([
    armour(me, foe, "Item_Armor_D_01_Lv2_C"),
    armour(me, foe, "Item_Armor_D_01_Lv2_C"),
    armour(me, foe, "Item_Armor_C_01_Lv3_C"),
  ], opts);

  assert.deepEqual(out.armourBroke, [{ level: 3, count: 1 }, { level: 2, count: 2 }]);
  assert.deepEqual(out.armourLost, []);
});

test("counts armour the focal player lost, from the victim side", () => {
  const out = buildEnvironment([
    armour(foe, me, "Item_Armor_D_01_Lv2_C"),
    armour(foe, me, "Item_Head_F_01_Lv2_C"),
  ], opts);

  assert.deepEqual(out.armourLost, [{ level: 2, count: 2 }]);
  assert.deepEqual(out.armourBroke, []);
});

test("puts armour with no level token last", () => {
  const out = buildEnvironment([
    armour(me, foe, "Item_Back_BlueBlocker"),
    armour(me, foe, "Item_Armor_C_01_Lv3_C"),
  ], opts);

  assert.deepEqual(out.armourBroke, [{ level: 3, count: 1 }, { level: null, count: 1 }]);
});

test("sums vehicle damage only from the focal attacker", () => {
  const out = buildEnvironment([
    vehDamage(me, 40.4),
    vehDamage(me, 60.6),
    vehDamage(foe, 900),
  ], opts);

  assert.equal(out.vehicleDamage, 101);
});

test("counts doors opened but not closed", () => {
  // Closing a door behind you is not a fact anybody reads.
  const out = buildEnvironment([
    door(me, "Opening"),
    door(me, "Opening"),
    door(me, "Closing"),
  ], opts);

  assert.equal(out.doorsOpened, 2);
});

test("counts windows and fences and ignores the rest", () => {
  const out = buildEnvironment([
    destroy(me, "Window"),
    destroy(me, "Window"),
    destroy(me, "Fence"),
    destroy(me, "ItemBox"),
    destroy(me, "Hay"),
    destroy(me, "SmokeCylinder_Long"),
  ], opts);

  assert.equal(out.windows, 2);
  assert.equal(out.fences, 1);
});

test("counts vaults and vending machines", () => {
  const out = buildEnvironment([
    vault(me),
    vault(me),
    { _T: "LogObjectInteraction", character: me, objectType: "VendingMachine", objectTypeStatus: "ACTIVATED" },
  ], opts);

  assert.equal(out.vaults, 2);
  assert.equal(out.vending, 1);
});

test("ignores another player's environment", () => {
  const out = buildEnvironment([
    door(foe, "Opening"),
    destroy(foe, "Window"),
    vault(foe),
    vehDamage(foe, 500),
  ], opts);

  assert.equal(out.doorsOpened, 0);
  assert.equal(out.windows, 0);
  assert.equal(out.vaults, 0);
  assert.equal(out.vehicleDamage, 0);
});

test("returns an empty, well-shaped result for junk", () => {
  [[], null, undefined, 42, [null, 7]].forEach((value) => {
    const out = buildEnvironment(value, opts);
    assert.deepEqual(out.armourBroke, [], JSON.stringify(value));
    assert.deepEqual(out.armourLost, []);
    assert.equal(out.vehicleDamage, 0);
    assert.equal(out.windows, 0);
    assert.equal(out.vaults, 0);
    assert.equal(out.doorsOpened, 0);
  });
});
