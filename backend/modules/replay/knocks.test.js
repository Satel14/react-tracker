const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractKnocks } = require("./knocks");

// Stubbed clock: the fixtures carry their own in-game time on `at`, so the
// tests never depend on buildMatchClock's _D fitting.
const clock = { timeOf: (ev) => (typeof ev?.at === "number" ? ev.at : null) };

const knock = (over = {}) => ({
  _T: "LogPlayerMakeGroggy",
  at: 431,
  attacker: { accountId: "account.att", location: { x: 412355.5, y: 288104.2, z: 1000 } },
  victim: { accountId: "account.vic", location: { x: 418644.9, y: 288130.1, z: 1050 } },
  damageCauserName: "WeapHK416_C",
  damageReason: "TorsoShot",
  distance: 6289.604,
  dBNOId: 7,
  ...over,
});

const revive = (over = {}) => ({
  _T: "LogPlayerRevive",
  at: 512,
  reviver: { accountId: "account.mate", location: { x: 100050, y: 200050 } },
  victim: { accountId: "account.vic", location: { x: 418644.9, y: 288130.1 } },
  ...over,
});

test("maps every field of a full knock, with dist in metres", () => {
  const { knocks, revives } = extractKnocks([knock()], clock);
  assert.equal(revives.length, 0);
  assert.deepEqual(knocks, [
    {
      t: 431,
      a: "account.att",
      v: "account.vic",
      ax: 4124,
      ay: 2881,
      vx: 4186,
      vy: 2881,
      w: "M416",
      wi: "ar",
      r: "TorsoShot",
      // 6289.604 cm rounds to 63 m -- NOT 6290, and NOT 62.
      dist: 63,
      id: 7,
    },
  ]);
});

test("keeps coordinates and distance on the same metre scale as readXY", () => {
  // Units guard. Real Erangel telemetry: locations are centimetres, and so is
  // LogPlayerMakeGroggy.distance (unlike LogParachuteLanding.distance, which is
  // already metres). If a refactor ever drops the cm -> m conversion, knock
  // markers silently desync from kills[].vx/vy by a factor of 100 and nothing
  // else fails, so pin both here.
  const { knocks } = extractKnocks(
    [
      knock({
        victim: { accountId: "account.vic", location: { x: 326080.71875, y: 361348, z: 3427.5 } },
        attacker: { accountId: "account.att", location: { x: 320000, y: 355549.9, z: 3400 } },
        distance: 6289.604,
      }),
    ],
    clock,
  );
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0].vx, 3261);
  assert.equal(knocks[0].vy, 3613);
  assert.equal(knocks[0].ax, 3200);
  assert.equal(knocks[0].ay, 3555);
  // A gunfight knock is tens of metres, not thousands.
  assert.equal(knocks[0].dist, 63);
  assert.ok(knocks[0].dist > 0 && knocks[0].dist < 1500, "a knock distance in metres stays under the map width");
  // The coordinates must be the same scale readXY produces for every other
  // point in the replay payload.
  const { readXY } = require("../telemetryUtils");
  assert.deepEqual({ x: knocks[0].vx, y: knocks[0].vy }, readXY({ x: 326080.71875, y: 361348 }));
});

test("emits an attacker-less knock with null attacker fields", () => {
  // Blue-zone knocks carry no attacker at all; dropping them would lose the
  // most common non-combat knock in the replay.
  const bluezone = knock({ attacker: undefined, damageCauserName: "Bluezone", damageReason: "None", distance: undefined, dBNOId: undefined });
  const { knocks } = extractKnocks([bluezone], clock);
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0].a, null);
  assert.equal(knocks[0].ax, null);
  assert.equal(knocks[0].ay, null);
  assert.equal(knocks[0].v, "account.vic");
  assert.equal(knocks[0].vx, 4186);
  assert.equal(knocks[0].vy, 2881);
  assert.equal(knocks[0].w, "Bluezone");
  assert.equal(knocks[0].r, "None");
  assert.equal(knocks[0].dist, 0);
  assert.equal(knocks[0].id, null);
});

test("nulls only the coordinates when an attacker's location is unreadable", () => {
  const { knocks } = extractKnocks([knock({ attacker: { accountId: "account.att", location: { x: "n/a", y: null } } })], clock);
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0].a, "account.att");
  assert.equal(knocks[0].ax, null);
  assert.equal(knocks[0].ay, null);
});

test("defaults an absent weapon, reason and dBNOId to null", () => {
  const { knocks } = extractKnocks([knock({ damageCauserName: undefined, damageReason: undefined, dBNOId: undefined })], clock);
  assert.equal(knocks[0].w, null);
  assert.equal(knocks[0].r, null);
  assert.equal(knocks[0].id, null);
});

test("keeps a dBNOId of 0", () => {
  const { knocks } = extractKnocks([knock({ dBNOId: 0 })], clock);
  assert.equal(knocks[0].id, 0);
});

test("maps a revive onto the victim's location", () => {
  const { knocks, revives } = extractKnocks([revive()], clock);
  assert.equal(knocks.length, 0);
  assert.deepEqual(revives, [{ t: 512, a: "account.mate", v: "account.vic", x: 4186, y: 2881 }]);
});

test("emits a revive with no reviver, with a null a", () => {
  const { revives } = extractKnocks([revive({ reviver: undefined })], clock);
  assert.equal(revives.length, 1);
  assert.equal(revives[0].a, null);
  assert.equal(revives[0].v, "account.vic");
  assert.equal(revives[0].x, 4186);
  assert.equal(revives[0].y, 2881);
});

test("returns both arrays sorted by t ascending", () => {
  const events = [
    knock({ at: 300, dBNOId: 3 }),
    revive({ at: 900 }),
    knock({ at: 100, dBNOId: 1 }),
    revive({ at: 200 }),
    knock({ at: 200, dBNOId: 2 }),
    revive({ at: 50 }),
  ];
  const { knocks, revives } = extractKnocks(events, clock);
  assert.deepEqual(knocks.map((k) => k.t), [100, 200, 300]);
  assert.deepEqual(knocks.map((k) => k.id), [1, 2, 3]);
  assert.deepEqual(revives.map((r) => r.t), [50, 200, 900]);
});

test("skips events with no victim accountId, no victim location or no clock time", () => {
  const events = [
    knock({ victim: { location: { x: 1, y: 2 } } }),
    knock({ victim: { accountId: "account.vic" } }),
    knock({ victim: { accountId: "account.vic", location: { x: "?", y: "?" } } }),
    knock({ at: null }),
    revive({ victim: { location: { x: 1, y: 2 } } }),
    revive({ victim: { accountId: "account.vic" } }),
    revive({ at: null }),
  ];
  const { knocks, revives } = extractKnocks(events, clock);
  assert.deepEqual(knocks, []);
  assert.deepEqual(revives, []);
});

test("never throws on malformed input", () => {
  const empty = { knocks: [], revives: [] };
  assert.deepEqual(extractKnocks(null, clock), empty);
  assert.deepEqual(extractKnocks(undefined, clock), empty);
  assert.deepEqual(extractKnocks([], clock), empty);
  assert.deepEqual(extractKnocks("not telemetry", clock), empty);
  assert.deepEqual(extractKnocks([null, undefined, 7, "x", {}], clock), empty);
  assert.deepEqual(extractKnocks([{ _T: "LogPlayerMakeGroggy" }, { _T: "LogPlayerRevive" }], clock), empty);
  assert.deepEqual(extractKnocks([knock()], null), empty);
  assert.deepEqual(extractKnocks([knock()], {}), empty);
});

test("ignores kills and every other event type", () => {
  const events = [
    { _T: "LogPlayerKillV2", at: 10, victim: { accountId: "account.vic", location: { x: 100, y: 100 } }, killer: { accountId: "account.att", location: { x: 200, y: 200 } } },
    { _T: "LogPlayerPosition", at: 11, character: { accountId: "account.vic", location: { x: 100, y: 100 } } },
    { _T: "LogPlayerTakeDamage", at: 12, victim: { accountId: "account.vic", location: { x: 100, y: 100 } } },
    { _T: "LogGameStatePeriodic", at: 13, gameState: {} },
    knock({ at: 14 }),
  ];
  const { knocks, revives } = extractKnocks(events, clock);
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0].t, 14);
  assert.deepEqual(revives, []);
});

// The kill feed shows a knock line with the gun that made it, so the raw
// causer name has to be resolved here rather than shipped for the client to
// guess at -- the frontend has no copy of the weapon table. Same helper the
// kill records and getMatchAnalysis use, so one gun reads the same everywhere.
test("a knock names its weapon the way the rest of the app does", () => {
  const { knocks } = extractKnocks([knock({ damageCauserName: "WeapAUG_C" })], clock);
  assert.equal(knocks[0].w, "AUG");
});

test("a knock nobody made still names what did it", () => {
  const { knocks } = extractKnocks(
    [knock({ attacker: null, damageCauserName: "BlueZone", distance: 0 })],
    clock,
  );
  assert.equal(knocks[0].a, null);
  assert.equal(knocks[0].w, "Blue Zone");
});

// The feed draws a silhouette, not the gun's name, so the record has to say
// which silhouette. Resolved here for the same reason the name is: the
// frontend has no copy of the weapon table.
test("a knock says which silhouette its weapon draws as", () => {
  const { knocks } = extractKnocks([knock({ damageCauserName: "WeapAUG_C" })], clock);
  assert.equal(knocks[0].wi, "ar");
});

test("a knock nobody made draws no weapon silhouette", () => {
  const { knocks } = extractKnocks([knock({ attacker: null, damageCauserName: "BlueZone" })], clock);
  assert.equal(knocks[0].w, "Blue Zone");
  assert.equal(knocks[0].wi, null);
});
