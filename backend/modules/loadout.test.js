const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildLoadout } = require("./loadout");

// _D is what the cutoff compares. Telemetry is NOT ordered -- ~600 events a
// match arrive out of order with steps back up to 78 s -- so these fixtures
// deliberately list some events out of order to prove the comparison is by
// timestamp and not by position.
const at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

const me = { accountId: "account.me", name: "Me", teamId: 1 };
const foe = { accountId: "account.foe", name: "Foe", teamId: 2 };

const item = (itemId, category, subCategory) => ({ itemId, category, subCategory, stackCount: 1 });

const equip = (s, itemId, subCategory, character = me, category = "Weapon") =>
  ({ _T: "LogItemEquip", _D: at(s), character, item: item(itemId, category, subCategory) });
const unequip = (s, itemId, subCategory, character = me, category = "Weapon") =>
  ({ _T: "LogItemUnequip", _D: at(s), character, item: item(itemId, category, subCategory) });
const attach = (s, parent, child, character = me) =>
  ({ _T: "LogItemAttach", _D: at(s), character, parentItem: item(parent, "Weapon", "Main"), childItem: item(child, "Attachment", "None") });
const detach = (s, parent, child, character = me) =>
  ({ _T: "LogItemDetach", _D: at(s), character, parentItem: item(parent, "Weapon", "Main"), childItem: item(child, "Attachment", "None") });
const died = (s, victim = me) =>
  ({ _T: "LogPlayerKillV2", _D: at(s), victim, killer: foe });
const position = (s, character = me) =>
  ({ _T: "LogPlayerPosition", _D: at(s), character, common: { isGame: 1 } });

test("reads the loadout at the moment of death, not at the end of the log", () => {
  // Measured: death strips everything, so replaying to the end of the log left
  // only an ascender and a parachute in all 8 sampled matches.
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    equip(20, "Item_Weapon_Kar98k_C", "Main"),
    died(30),
    unequip(31, "Item_Weapon_HK416_C", "Main"),
    unequip(32, "Item_Weapon_Kar98k_C", "Main"),
  ], { accountId: "account.me" });

  assert.equal(out.cutoff, "death");
  assert.deepEqual(out.weapons.map((w) => w.name), ["M416", "Kar98k"]);
});

test("compares the cutoff by timestamp, not by position in the file", () => {
  // The equip is LISTED after the death but HAPPENED before it. Ordering by
  // position would drop it; ordering by _D keeps it.
  const out = buildLoadout([
    died(30),
    equip(10, "Item_Weapon_HK416_C", "Main"),
    equip(40, "Item_Weapon_Kar98k_C", "Main"),
  ], { accountId: "account.me" });

  assert.deepEqual(out.weapons.map((w) => w.name), ["M416"]);
});

test("a survivor is cut at their last position sample", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    position(50),
    equip(60, "Item_Weapon_Kar98k_C", "Main"),
  ], { accountId: "account.me" });

  assert.equal(out.cutoff, "survived");
  assert.deepEqual(out.weapons.map((w) => w.name), ["M416"]);
});

test("the repair kit never occupies a weapon slot", () => {
  // PUBG files it under Weapon/Main. It was the sole cause of every
  // reconstruction breach -- 3 primaries where the game allows 2.
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    equip(11, "Item_Weapon_IntegratedRepair_C", "Main"),
    equip(12, "Item_Weapon_Kar98k_C", "Main"),
    died(20),
  ], { accountId: "account.me" });

  assert.equal(out.weapons.length, 2);
  assert.ok(!out.weapons.some((w) => /Repair/.test(w.key)));
});

test("orders weapons Main, Handgun, Melee", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_Pan_C", "Melee"),
    equip(11, "Item_Weapon_G18_C", "Handgun"),
    equip(12, "Item_Weapon_HK416_C", "Main"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(out.weapons.map((w) => w.slot), ["Main", "Handgun", "Melee"]);
});

test("names a curated sight and falls back for an unconfirmed one", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    attach(11, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Upper_Scope6x_C"),
    equip(12, "Item_Weapon_Kar98k_C", "Main"),
    // DualOptic_4x1x is a real measured id whose in-game name is unconfirmed,
    // so it must render generically rather than as a guess.
    attach(13, "Item_Weapon_Kar98k_C", "Item_Attach_Weapon_Upper_DualOptic_4x1x_C"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(out.weapons[0].attachments, [{ slot: "Upper", name: "6x Scope" }]);
  assert.deepEqual(out.weapons[1].attachments, [{ slot: "Upper", name: null }]);
});

test("derives every attachment slot from the id and orders them for reading", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    attach(11, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Stock_AR_HeavyStock_C"),
    attach(12, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Lower_TiltedGrip_C"),
    attach(13, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Magazine_Extended_Large_C"),
    attach(14, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Muzzle_AR_MuzzleBrake_C"),
    attach(15, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Upper_DotSight_01_C"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(
    out.weapons[0].attachments.map((a) => a.slot),
    ["Upper", "Muzzle", "Magazine", "Lower", "Stock"]
  );
});

test("a detached attachment is gone", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    attach(11, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Upper_Scope6x_C"),
    detach(12, "Item_Weapon_HK416_C", "Item_Attach_Weapon_Upper_Scope6x_C"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(out.weapons[0].attachments, []);
});

test("equip, unequip, equip again leaves one item", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main"),
    unequip(11, "Item_Weapon_HK416_C", "Main"),
    equip(12, "Item_Weapon_HK416_C", "Main"),
    died(20),
  ], { accountId: "account.me" });

  assert.equal(out.weapons.length, 1);
});

test("reads armour levels from the id and tolerates one without a level", () => {
  const out = buildLoadout([
    equip(10, "Item_Head_F_01_Lv2_C", "Headgear", me, "Equipment"),
    equip(11, "Item_Armor_C_01_Lv3_C", "Vest", me, "Equipment"),
    // Ships without a trailing _C and without a level token -- both real.
    equip(12, "Item_Back_BlueBlocker", "Backpack", me, "Equipment"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(
    out.armour.map((a) => [a.slot, a.level]),
    [["Headgear", 2], ["Vest", 3], ["Backpack", null]]
  );
});

test("the starting parachute pack is not gear", () => {
  const out = buildLoadout([
    equip(10, "Item_Back_B_01_StartParachutePack_C", "Backpack", me, "Equipment"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(out.armour, []);
});

test("aggregates who was looted, and drops a creator it cannot name", () => {
  const roster = { _T: "LogMatchStart", _D: at(0), characters: [{ character: me }, { character: foe }] };
  const fromBox = (s, creatorAccountId) => ({
    _T: "LogItemPickupFromLootBox", _D: at(s), character: me,
    item: item("Item_Weapon_HK416_C", "Weapon", "Main"), creatorAccountId, ownerTeamId: 2,
  });
  const out = buildLoadout([
    roster,
    fromBox(11, "account.foe"),
    fromBox(12, "account.foe"),
    fromBox(13, "account.nobody"),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(out.lootedFrom, [{ accountId: "account.foe", name: "Foe", items: 2 }]);
});

test("counts pickups, drops and care-package takes", () => {
  const pickup = (s, type) => ({ _T: type, _D: at(s), character: me, item: item("Item_Ammo_556mm_C", "Ammunition", "None") });
  const out = buildLoadout([
    pickup(10, "LogItemPickup"),
    pickup(11, "LogItemPickup"),
    pickup(12, "LogItemDrop"),
    pickup(13, "LogItemPickupFromCarepackage"),
    died(20),
  ], { accountId: "account.me" });

  assert.equal(out.picked, 2);
  assert.equal(out.dropped, 1);
  assert.equal(out.fromCarePackage, 1);
});

test("ignores another player's items", () => {
  const out = buildLoadout([
    equip(10, "Item_Weapon_HK416_C", "Main", foe),
    died(20),
  ], { accountId: "account.me" });

  assert.deepEqual(out.weapons, []);
  assert.equal(out.picked, 0);
});

test("returns an empty, well-shaped result for junk", () => {
  [[], null, undefined, 42, [null, 7]].forEach((value) => {
    const out = buildLoadout(value, { accountId: "account.me" });
    assert.deepEqual(out.weapons, [], JSON.stringify(value));
    assert.deepEqual(out.armour, []);
    assert.deepEqual(out.lootedFrom, []);
    assert.equal(out.cutoff, null);
    assert.equal(out.picked, 0);
  });
});
