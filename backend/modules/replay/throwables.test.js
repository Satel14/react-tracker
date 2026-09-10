const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractThrowables } = require("./throwables");

// A clock stub: the real one is built from LogMatchStart and is not this
// module's concern. elapsedTime standing in for the in-game second keeps the
// fixtures readable.
const clock = { timeOf: (ev) => (typeof ev.elapsedTime === "number" ? ev.elapsedTime : null) };

const thrower = (name, x, y) => ({
  name, accountId: `account.${name}`, teamId: 1, location: { x, y, z: 0 },
});

const throwEv = (elapsedTime, attackId, itemId, x, y) => ({
  _T: "LogPlayerUseThrowable", elapsedTime, attackId,
  attacker: thrower("Me", x, y),
  weapon: { itemId, stackCount: 1, category: "Equipment", subCategory: "Throwable" },
});

const dmgEv = (elapsedTime, attackId, victimName, x, y, damage) => ({
  _T: "LogPlayerTakeDamage", elapsedTime, attackId,
  attacker: thrower("Me", 0, 0),
  victim: thrower(victimName, x, y),
  damage, damageTypeCategory: "Damage_Explosion", damageCauserName: "ProjGrenade_C",
});

test("packs throws into columns in time order", () => {
  const out = extractThrowables([
    throwEv(80, 2, "Item_Weapon_SmokeBomb_C", 200000, 300000),
    throwEv(20, 1, "Item_Weapon_Grenade_C", 100000, 100000),
  ], clock);

  assert.deepEqual(out.throws.t, [20, 80]);
  // Centimetres in, whole metres out -- the scale every other replay layer uses.
  assert.deepEqual(out.throws.ax, [1000, 2000]);
  assert.deepEqual(out.throws.ay, [1000, 3000]);
});

test("joins a throw to where its damage landed, by attackId", () => {
  const out = extractThrowables([
    throwEv(20, 1, "Item_Weapon_Grenade_C", 100000, 100000),
    dmgEv(21, 1, "Foe", 104200, 100000, 60),
  ], clock);

  assert.deepEqual(out.throws.vx, [1042]);
  assert.deepEqual(out.throws.vy, [1000]);
});

test("leaves the endpoint null for a throw that damaged nobody", () => {
  // 58% of real throws are like this -- smoke, flash and flares deal no damage,
  // so telemetry holds no second position for them at all.
  const out = extractThrowables([throwEv(20, 1, "Item_Weapon_SmokeBomb_C", 100000, 100000)], clock);

  assert.deepEqual(out.throws.vx, [null]);
  assert.deepEqual(out.throws.vy, [null]);
});

test("a throw whose only damage event is zero gets no endpoint", () => {
  // This is where the zero-damage filter actually bites. A molotov burning a
  // body already at 0 HP produced 12 such events in one measured match; if they
  // counted, the map would draw a line to a victim for a throw that took nothing
  // off, and the legend says "throw that dealt damage".
  const out = extractThrowables([
    throwEv(20, 1, "Item_Weapon_Molotov_C", 100000, 100000),
    dmgEv(21, 1, "Foe", 104200, 100000, 0),
  ], clock);

  assert.deepEqual(out.throws.vx, [null]);
  assert.deepEqual(out.throws.vy, [null]);
  assert.equal(out.throwKinds[0].damage, 0);
});

test("takes the FIRST damage event by time when a throw hits several victims", () => {
  const out = extractThrowables([
    throwEv(20, 1, "Item_Weapon_Grenade_C", 100000, 100000),
    dmgEv(23, 1, "Late", 900000, 900000, 10),
    dmgEv(21, 1, "First", 104200, 100000, 60),
  ], clock);

  assert.deepEqual(out.throws.vx, [1042]);
  assert.deepEqual(out.throws.vy, [1000]);
});

test("names kinds through weaponMeta and counts them", () => {
  const out = extractThrowables([
    throwEv(10, 1, "Item_Weapon_Grenade_C", 100000, 100000),
    throwEv(11, 2, "Item_Weapon_Grenade_C", 100000, 100000),
    throwEv(12, 3, "Item_Weapon_SmokeBomb_C", 100000, 100000),
    dmgEv(13, 1, "Foe", 104200, 100000, 60),
    dmgEv(14, 1, "Foe2", 104300, 100000, 40),
  ], clock);

  const frag = out.throwKinds.find((k) => k.name === "Frag Grenade");
  const smoke = out.throwKinds.find((k) => k.name === "Smoke Bomb");
  assert.equal(frag.thrown, 2);
  // Every damage event of that attackId, not only the one the line ends at.
  assert.equal(frag.damage, 100);
  assert.equal(frag.damaging, true);
  assert.equal(smoke.thrown, 1);
  assert.equal(smoke.damage, 0);
  assert.equal(smoke.damaging, false);
});

test("k indexes into throwKinds", () => {
  const out = extractThrowables([
    throwEv(10, 1, "Item_Weapon_SmokeBomb_C", 100000, 100000),
    throwEv(11, 2, "Item_Weapon_Grenade_C", 100000, 100000),
  ], clock);

  assert.equal(out.throwKinds[out.throws.k[0]].name, "Smoke Bomb");
  assert.equal(out.throwKinds[out.throws.k[1]].name, "Frag Grenade");
});

test("keeps an unrecognised throwable under a generic label", () => {
  // Opposite of the POI rule: the position is exact and only the name is
  // unknown, so dropping the throw loses more than labelling it generically.
  // Item_Weapon_CoverStructDropHandFlare_C is a real one weaponMeta cannot name.
  const out = extractThrowables([
    throwEv(10, 1, "Item_Weapon_CoverStructDropHandFlare_C", 100000, 100000),
  ], clock);

  assert.equal(out.throws.t.length, 1);
  assert.equal(out.throwKinds.length, 1);
  assert.equal(out.throwKinds[0].name, "Throwable");
});

test("an unknown kind that actually damaged someone is marked damaging", () => {
  // Self-correcting: a throwable PUBG adds later is classified by what it did,
  // not only by a hardcoded list this file would have to chase.
  const out = extractThrowables([
    throwEv(10, 1, "Item_Weapon_SomethingNew_C", 100000, 100000),
    dmgEv(11, 1, "Foe", 104200, 100000, 35),
  ], clock);

  assert.equal(out.throwKinds[0].damaging, true);
  assert.equal(out.throwKinds[0].damage, 35);
});

test("drops a throw with no usable thrower position", () => {
  // A dead-centre origin is telemetry's "unknown", not the map centre -- same
  // rule readEndpoint applies in shots.js.
  const out = extractThrowables([
    throwEv(10, 1, "Item_Weapon_Grenade_C", 0, 0),
    { _T: "LogPlayerUseThrowable", elapsedTime: 11, attackId: 2, weapon: { itemId: "Item_Weapon_Grenade_C" } },
  ], clock);

  assert.deepEqual(out.throws.t, []);
  assert.deepEqual(out.throwKinds, []);
});

test("keeps a throw that carries no attackId", () => {
  const out = extractThrowables([
    { _T: "LogPlayerUseThrowable", elapsedTime: 10, attacker: thrower("Me", 100000, 100000), weapon: { itemId: "Item_Weapon_Grenade_C" } },
  ], clock);

  assert.equal(out.throws.t.length, 1);
  assert.deepEqual(out.throws.vx, [null]);
});

test("survives junk without throwing", () => {
  [null, undefined, 42, {}, [null, 7, "x"]].forEach((value) => {
    const out = extractThrowables(value, clock);
    assert.deepEqual(out.throws.t, [], JSON.stringify(value));
    assert.deepEqual(out.throwKinds, []);
  });
  // A clock that cannot tell the time yields nothing rather than NaN rows.
  const out = extractThrowables([throwEv(10, 1, "Item_Weapon_Grenade_C", 100000, 100000)], {});
  assert.deepEqual(out.throws.t, []);
});

// ------------------------------------------------- focal-scoped counts

const { throwCountsFor } = require("./throwables");

const opts = { accountId: "account.Me" };

// The `thrower` helper builds accountId as `account.${name}`, so the focal id
// above matches a thrower named "Me".
const otherThrow = (elapsedTime, attackId, itemId) => ({
  _T: "LogPlayerUseThrowable", elapsedTime, attackId,
  attacker: thrower("Foe", 500000, 500000),
  weapon: { itemId, stackCount: 1, category: "Equipment", subCategory: "Throwable" },
});

test("counts only the focal player's throws", () => {
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_Grenade_C", 100000, 100000),
    otherThrow(11, 2, "Item_Weapon_Grenade_C"),
    otherThrow(12, 3, "Item_Weapon_SmokeBomb_C"),
  ], opts);

  assert.equal(out.totalThrown, 1);
  assert.deepEqual(out.used.map((u) => [u.name, u.count]), [["Frag Grenade", 1]]);
});

test("joins damage by attackId, for the focal player's throws only", () => {
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_Grenade_C", 100000, 100000),
    dmgEv(11, 1, "Foe", 104200, 100000, 55),
    otherThrow(12, 2, "Item_Weapon_Grenade_C"),
    dmgEv(13, 2, "Someone", 504200, 500000, 90),
  ], opts);

  assert.equal(out.totalDamage, 55);
  assert.equal(out.used[0].damage, 55);
});

test("a damage-capable kind that dealt nothing keeps the flag and reports zero", () => {
  // The molotov row is meant to read "+0 dmg": it can deal damage and did not.
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_Molotov_C", 100000, 100000),
  ], opts);

  assert.equal(out.used[0].damaging, true);
  assert.equal(out.used[0].damage, 0);
  assert.equal(out.totalDamage, 0);
});

test("a kind that cannot deal damage reports no damage and no flag", () => {
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_SmokeBomb_C", 100000, 100000),
  ], opts);

  assert.equal(out.used[0].damaging, false);
  assert.equal(out.used[0].damage, 0);
});

test("a zero-damage hit does not count as damage in the focal counts", () => {
  // 16 of 27 damage events on a throw carried damage 0 in one measured match --
  // twelve of them one molotov burning a body already at 0 HP.
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_Grenade_C", 100000, 100000),
    dmgEv(11, 1, "Foe", 104200, 100000, 0),
  ], opts);

  assert.equal(out.totalDamage, 0);
  assert.equal(out.used[0].damage, 0);
});

test("an unknown focal kind that damaged someone is marked damaging", () => {
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_SomethingNew_C", 100000, 100000),
    dmgEv(11, 1, "Foe", 104200, 100000, 35),
  ], opts);

  assert.equal(out.used[0].damaging, true);
  assert.equal(out.used[0].damage, 35);
});

test("sorts focal counts by count descending then by name", () => {
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_SmokeBomb_C", 100000, 100000),
    throwEv(11, 2, "Item_Weapon_Grenade_C", 100000, 100000),
    throwEv(12, 3, "Item_Weapon_Grenade_C", 100000, 100000),
    throwEv(13, 4, "Item_Weapon_FlashBang_C", 100000, 100000),
  ], opts);

  assert.deepEqual(out.used.map((u) => u.name), ["Frag Grenade", "Flash Bang", "Smoke Bomb"]);
});

test("resolves the focal player by name as well as by account id", () => {
  const byName = throwCountsFor([throwEv(10, 1, "Item_Weapon_Grenade_C", 100000, 100000)], { playerName: "me" });
  assert.equal(byName.totalThrown, 1);
});

test("keeps an unrecognised focal throwable under the generic label", () => {
  const out = throwCountsFor([
    throwEv(10, 1, "Item_Weapon_CoverStructDropHandFlare_C", 100000, 100000),
  ], opts);
  assert.equal(out.used[0].name, "Throwable");
});

test("returns an empty, well-shaped result for junk", () => {
  [[], null, undefined, 42, [null, 7]].forEach((value) => {
    const out = throwCountsFor(value, opts);
    assert.deepEqual(out.used, [], JSON.stringify(value));
    assert.equal(out.totalThrown, 0);
    assert.equal(out.totalDamage, 0);
  });
});
