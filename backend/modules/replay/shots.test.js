const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractShots } = require("./shots");

// The real clock derives a time from _D/elapsedTime; here the stub just reads
// back a `_t` marker planted on the fixture so each test controls ordering.
const clock = { timeOf: (ev) => (typeof ev?._t === "number" ? ev._t : null) };

const loc = (x, y) => ({ x, y, z: 1000 });

const gun = (over = {}) => ({
  _T: "LogPlayerTakeDamage",
  damageTypeCategory: "Damage_Gun",
  attackId: 1,
  damage: 25,
  _t: 10,
  attacker: { accountId: "account.a", location: loc(1000, 2000) },
  victim: { accountId: "account.v", location: loc(3000, 4000) },
  ...over,
});

const lengths = (out) => [out.t, out.a, out.v, out.ax, out.ay, out.vx, out.vy].map((arr) => arr.length);

test("one attackId hitting two different victims yields two lines", () => {
  const out = extractShots(
    [
      gun({ attackId: 77, victim: { accountId: "account.v1", location: loc(3000, 4000) } }),
      gun({ attackId: 77, victim: { accountId: "account.v2", location: loc(5000, 6000) } }),
    ],
    clock,
  );
  assert.equal(out.t.length, 2);
  assert.deepEqual(out.v, ["account.v1", "account.v2"]);
  assert.deepEqual(out.vx, [30, 50]);
  assert.deepEqual(out.vy, [40, 60]);
});

test("the same (attackId, victim) pair twice yields one line", () => {
  const out = extractShots(
    [
      gun({ attackId: 77, damage: 25 }),
      // A second telemetry row for the same pellet-group/victim pair: a duplicate.
      gun({ attackId: 77, damage: 41, _t: 12 }),
    ],
    clock,
  );
  assert.equal(out.t.length, 1);
  // The FIRST occurrence wins, so the later damage/time must not leak through.
  assert.deepEqual(out.t, [10]);
});

test("the same attackId is deduped per victim, not globally", () => {
  const out = extractShots(
    [
      gun({ attackId: 5, victim: { accountId: "account.v1", location: loc(3000, 4000) } }),
      gun({ attackId: 5, victim: { accountId: "account.v2", location: loc(5000, 6000) } }),
      gun({ attackId: 5, victim: { accountId: "account.v1", location: loc(9000, 9000) } }),
      gun({ attackId: 6, victim: { accountId: "account.v1", location: loc(3000, 4000) } }),
    ],
    clock,
  );
  assert.equal(out.t.length, 3);
  assert.deepEqual(out.v, ["account.v1", "account.v2", "account.v1"]);
  // The third row is the repeat of (5, v1) and must be the one dropped.
  assert.deepEqual(out.vx, [30, 50, 30]);
});

test("skips a gun hit whose attacker location is zeroed", () => {
  const out = extractShots(
    [
      gun({ attacker: { accountId: "account.a", location: loc(0, 0) } }),
      gun({ attackId: 2, attacker: { accountId: "account.a", location: { z: 1000 } } }),
      gun({ attackId: 3, attacker: { accountId: "account.a" } }),
    ],
    clock,
  );
  assert.deepEqual(lengths(out), [0, 0, 0, 0, 0, 0, 0]);
});

test("skips a gun hit whose victim location is zeroed or absent", () => {
  const out = extractShots(
    [
      gun({ victim: { accountId: "account.v", location: loc(0, 0) } }),
      gun({ attackId: 2, victim: { accountId: "account.v", location: null } }),
    ],
    clock,
  );
  assert.equal(out.t.length, 0);
});

test("a zeroed coordinate on only one axis is still readable", () => {
  const out = extractShots([gun({ attacker: { accountId: "account.a", location: loc(0, 2000) } })], clock);
  assert.equal(out.t.length, 1);
  assert.deepEqual(out.ax, [0]);
  assert.deepEqual(out.ay, [20]);
});

test("blue zone and DBNO damage never reach the output", () => {
  const out = extractShots(
    [
      gun({ attackId: 1, damageTypeCategory: "Damage_BlueZone" }),
      gun({ attackId: 2, damageTypeCategory: "Damage_Gun_DBNO" }),
      gun({ attackId: 3, damageTypeCategory: "Damage_DBNO" }),
      gun({ attackId: 4, damageTypeCategory: "Damage_Explosion_Grenade" }),
      gun({ attackId: 5, damageTypeCategory: "Damage_Melee" }),
      gun({ attackId: 6, damageTypeCategory: "Damage_Groggy" }),
      gun({ attackId: 7 }),
    ],
    clock,
  );
  assert.equal(out.t.length, 1);
  assert.deepEqual(out.a, ["account.a"]);
});

// Shot lines must land in the same map space as kills[].vx/vy and player
// positions: centimetres converted to integer metres by readXY, not a scale of
// this layer's own.
test("converts world units to integer metres, the same scale as kills and positions", () => {
  const out = extractShots(
    [
      gun({
        attacker: { accountId: "account.a", location: { x: 326080.71875, y: 129999.5, z: 0 } },
        victim: { accountId: "account.v", location: { x: 12345, y: 67890, z: 0 } },
      }),
    ],
    clock,
  );
  assert.deepEqual(out.ax, [3261]);
  assert.deepEqual(out.ay, [1300]);
  assert.deepEqual(out.vx, [123]);
  assert.deepEqual(out.vy, [679]);
});

test("all seven arrays stay equal length and the output is sorted by t", () => {
  const out = extractShots(
    [
      gun({ attackId: 1, _t: 300 }),
      gun({ attackId: 2, _t: 5 }),
      gun({ attackId: 3, _t: 120 }),
      gun({ attackId: 4, _t: 0 }),
    ],
    clock,
  );
  assert.deepEqual(lengths(out), [4, 4, 4, 4, 4, 4, 4]);
  assert.deepEqual(out.t, [0, 5, 120, 300]);
});

test("skips events the clock cannot place", () => {
  const out = extractShots([gun({ _t: undefined }), gun({ attackId: 2, _t: 42 })], clock);
  assert.deepEqual(out.t, [42]);
});

test("skips events missing either accountId", () => {
  const out = extractShots(
    [
      gun({ attacker: { location: loc(1000, 2000) } }),
      gun({ attackId: 2, victim: { location: loc(3000, 4000) } }),
      gun({ attackId: 3, attacker: { accountId: "", location: loc(1000, 2000) } }),
    ],
    clock,
  );
  assert.equal(out.t.length, 0);
});

// The damage rounding test that stood here moved with the column it was
// about: damage.js owns it now, and covers the zone and a fall besides.

test("carries the attacker and victim accountIds through", () => {
  const out = extractShots(
    [gun({ attacker: { accountId: "account.killer", location: loc(1000, 2000) }, victim: { accountId: "account.target", location: loc(3000, 4000) } })],
    clock,
  );
  assert.deepEqual(out.a, ["account.killer"]);
  assert.deepEqual(out.v, ["account.target"]);
});

test("does not throw on malformed input", () => {
  for (const bad of [null, undefined, [], {}, "telemetry", 7]) {
    const out = extractShots(bad, clock);
    assert.deepEqual(lengths(out), [0, 0, 0, 0, 0, 0, 0]);
  }
  assert.deepEqual(
    lengths(
      extractShots(
        [
          null,
          undefined,
          {},
          { _T: "LogPlayerTakeDamage" },
          { _T: "LogPlayerTakeDamage", damageTypeCategory: "Damage_Gun" },
          { _T: "LogPlayerTakeDamage", damageTypeCategory: "Damage_Gun", attacker: { accountId: "account.a", location: loc(1, 1) } },
          { _T: "LogPlayerPosition" },
        ],
        clock,
      ),
    ),
    [0, 0, 0, 0, 0, 0, 0],
  );
});

test("does not throw when the clock is missing or unusable", () => {
  for (const bad of [null, undefined, {}, { timeOf: null }]) {
    assert.deepEqual(lengths(extractShots([gun()], bad)), [0, 0, 0, 0, 0, 0, 0]);
  }
});

test("an attackId-less hit is not folded onto one line per victim", () => {
  // Keying on a coerced "undefined" would make every such hit on a victim
  // collapse into a single shot line, hiding a whole match of fire.
  const hit = (t, x) => ({
    _T: "LogPlayerTakeDamage",
    damageTypeCategory: "Damage_Gun",
    at: t,
    attacker: { accountId: "account.k", location: { x, y: 200000, z: 0 } },
    victim: { accountId: "account.v", location: { x: 300000, y: 300000, z: 0 } },
    damage: 30,
  });
  const clock = { timeOf: (ev) => (typeof ev.at === "number" ? ev.at : null) };
  const out = extractShots([hit(1, 100000), hit(2, 110000), hit(3, 120000)], clock);
  assert.equal(out.t.length, 3);
  assert.deepEqual(out.ax, [1000, 1100, 1200]);
});

test("still dedupes on the pair when an attackId is present", () => {
  const row = (id, victim) => ({
    _T: "LogPlayerTakeDamage",
    damageTypeCategory: "Damage_Gun",
    attackId: id,
    at: 5,
    attacker: { accountId: "account.k", location: { x: 100000, y: 200000, z: 0 } },
    victim: { accountId: victim, location: { x: 300000, y: 300000, z: 0 } },
    damage: 30,
  });
  const clock = { timeOf: (ev) => ev.at };
  // Same pair twice collapses; two victims under one attackId stay separate.
  const out = extractShots([row(7, "account.v"), row(7, "account.v"), row(7, "account.w")], clock);
  assert.equal(out.t.length, 2);
  assert.deepEqual(out.v, ["account.v", "account.w"]);
});
