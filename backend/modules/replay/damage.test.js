const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractDamage } = require("./damage");

const clock = { timeOf: (ev) => (typeof ev?.at === "number" ? ev.at : null) };
const index = new Map([["account.att", 0], ["account.vic", 1], ["account.third", 2]]);

const hit = (over = {}) => ({
  _T: "LogPlayerTakeDamage",
  at: 120,
  attacker: { accountId: "account.att" },
  victim: { accountId: "account.vic" },
  damage: 18.7,
  damageTypeCategory: "Damage_Gun",
  ...over,
});

test("packs a hit into parallel columns, keyed by player index", () => {
  // Indices, not account ids: an id is forty characters and this layer is the
  // densest in the payload. The frontend already has the players array these
  // index into, and it needs their live positions from it anyway.
  const d = extractDamage([hit()], clock, index);
  assert.deepEqual(d, { t: [120], a: [0], v: [1], d: [19] });
});

test("counts damage from everything that takes health, not only from guns", () => {
  // The zone, a car, a grenade, a fall, a jerry can. Every one of these is a
  // number the player watched come off their own health bar.
  const events = [
    hit({ at: 10, damageTypeCategory: "Damage_BlueZone", attacker: null, damage: 3 }),
    hit({ at: 20, damageTypeCategory: "Damage_VehicleHit", damage: 82 }),
    hit({ at: 30, damageTypeCategory: "Damage_Explosion_Grenade", damage: 47 }),
    hit({ at: 40, damageTypeCategory: "Damage_Instant_Fall", attacker: { accountId: "account.vic" }, damage: 55 }),
    hit({ at: 50, damageTypeCategory: "Damage_Explosion_RedZone", attacker: null, damage: 85 }),
  ];
  const d = extractDamage(events, clock, index);
  assert.deepEqual(d.t, [10, 20, 30, 40, 50]);
  assert.deepEqual(d.d, [3, 82, 47, 55, 85]);
});

test("credits nobody for damage a player did to themselves", () => {
  // A jerry can you shot, a fall you took. The victim's number is real and is
  // shown; crediting the victim as their own attacker would put a "damage
  // dealt" number on them for it.
  const d = extractDamage(
    [hit({ attacker: { accountId: "account.vic" }, damageTypeCategory: "Damage_Explosion_JerryCan" })],
    clock,
    index,
  );
  assert.deepEqual(d.a, [-1]);
  assert.deepEqual(d.v, [1]);
});

test("credits nobody when there is no attacker at all", () => {
  assert.deepEqual(extractDamage([hit({ attacker: null })], clock, index).a, [-1]);
  assert.deepEqual(extractDamage([hit({ attacker: undefined })], clock, index).a, [-1]);
  assert.deepEqual(extractDamage([hit({ attacker: {} })], clock, index).a, [-1]);
});

test("drops the events that took no health", () => {
  // A match carries thousands of zero-damage rows -- every bleed-out tick on a
  // knocked player, every punch that hit armour. A floating zero is noise.
  const events = [hit({ damage: 0 }), hit({ damage: -5 }), hit({ damage: "x" }), hit({ damage: undefined })];
  assert.deepEqual(extractDamage(events, clock, index).t, []);
});

test("rounds to whole points, the way the game shows them", () => {
  const d = extractDamage([hit({ damage: 18.4 }), hit({ at: 121, damage: 18.5 })], clock, index);
  assert.deepEqual(d.d, [18, 19]);
});

test("keeps an attacker the roster never saw off the record", () => {
  // A player absent from the players array has no index and no marker to fly a
  // number off, so the hit still counts against the victim with nobody
  // credited rather than pointing at index -1 as if it meant something.
  const d = extractDamage([hit({ attacker: { accountId: "account.ghost" } })], clock, index);
  assert.deepEqual(d.a, [-1]);
  assert.deepEqual(d.v, [1]);
});

test("drops a hit on a victim the roster never saw", () => {
  assert.deepEqual(extractDamage([hit({ victim: { accountId: "account.ghost" } })], clock, index).t, []);
  assert.deepEqual(extractDamage([hit({ victim: null })], clock, index).t, []);
});

test("sorts by time", () => {
  const events = [hit({ at: 300 }), hit({ at: 100 }), hit({ at: 200 })];
  assert.deepEqual(extractDamage(events, clock, index).t, [100, 200, 300]);
});

test("ignores every other event type", () => {
  const events = [
    { _T: "LogPlayerKillV2", at: 10, victim: { accountId: "account.vic" } },
    { _T: "LogPlayerMakeGroggy", at: 11, victim: { accountId: "account.vic" }, damage: 30 },
    { _T: "LogPlayerPosition", at: 12 },
    hit({ at: 13 }),
  ];
  assert.deepEqual(extractDamage(events, clock, index).t, [13]);
});

test("never throws on malformed input", () => {
  const empty = { t: [], a: [], v: [], d: [] };
  for (const args of [[null, clock, index], [undefined, clock, index], ["x", clock, index],
    [[null, 7, {}], clock, index], [[hit()], null, index], [[hit()], {}, index],
    [[hit()], clock, null], [[hit()], clock, new Map()]]) {
    assert.deepEqual(extractDamage(...args), empty);
  }
});

test("skips an event the clock cannot place", () => {
  assert.deepEqual(extractDamage([hit({ at: null })], clock, index).t, []);
});
