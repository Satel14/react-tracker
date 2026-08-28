const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractLandings } = require("./landings");

// The real clock lives in telemetryUtils; here __t stamps the in-game second.
const clock = { timeOf: (ev) => ev?.__t ?? null };

// Locations are raw telemetry centimetres, as PUBG sends them.
const landing = (accountId, t, x, y, distance) => ({
  _T: "LogParachuteLanding",
  __t: t,
  distance,
  character: { accountId, location: { x, y } },
});

test("keeps only the earliest landing per player, not the first in array order", () => {
  // Comeback BR and redeploy land the same player up to five times, and the
  // stream is not sorted: t=90 arrives before the real drop at t=40.
  const out = extractLandings(
    [
      landing("account.a", 90, 410000, 522000, 90.4),
      landing("account.a", 40, 162745.421875, 602955.5, 40.6),
      landing("account.a", 300, 700000, 100000, 300.5),
    ],
    clock,
  );
  assert.equal(out.length, 1);
  // x/y/d must come from the t=40 event too, not merely the t value.
  assert.deepEqual(out[0], { a: "account.a", t: 40, x: 1627, y: 6030, d: 41 });
});

test("emits coordinates in metres and distance unconverted", () => {
  // readXY's scale: centimetres in, integer metres out.
  const out = extractLandings([landing("account.a", 10, 162745.421875, 602955.5, 222.404)], clock);
  // LogParachuteLanding.distance is already metres, so it is NOT divided by 100.
  assert.deepEqual(out, [{ a: "account.a", t: 10, x: 1627, y: 6030, d: 222 }]);
});

test("a whole match of landing distances stays on the metre scale", () => {
  // Measured range across a real match: 16.6 m to 1318.6 m of canopy travel.
  const out = extractLandings(
    [
      landing("account.min", 10, 410000, 522000, 16.6),
      landing("account.mid", 20, 410000, 522000, 402.7),
      landing("account.max", 30, 410000, 522000, 1318.6),
    ],
    clock,
  );
  assert.deepEqual(out.map((l) => l.d), [17, 403, 1319]);
});

test("emits one entry per player, sorted by t ascending", () => {
  const out = extractLandings(
    [landing("account.b", 120, 10000, 20000, 1), landing("account.a", 55, 30000, 40000, 2)],
    clock,
  );
  assert.deepEqual(out, [
    { a: "account.a", t: 55, x: 300, y: 400, d: 2 },
    { a: "account.b", t: 120, x: 100, y: 200, d: 1 },
  ]);
});

test("sorts an out-of-order stream of repeat landings by each player's first drop", () => {
  const out = extractLandings(
    [
      landing("account.c", 210, 900000, 900000, 5),
      landing("account.a", 88, 111000, 222000, 5),
      landing("account.b", 61, 333000, 444000, 5),
      landing("account.a", 47, 555000, 666000, 5),
      landing("account.c", 52, 777000, 888000, 5),
      landing("account.b", 190, 999000, 111000, 5),
    ],
    clock,
  );
  assert.deepEqual(out.map((l) => [l.a, l.t]), [
    ["account.a", 47],
    ["account.c", 52],
    ["account.b", 61],
  ]);
});

test("defaults a missing or non-numeric distance to 0", () => {
  const out = extractLandings(
    [
      landing("account.a", 10, 410000, 522000, undefined),
      landing("account.b", 20, 410000, 522000, NaN),
      landing("account.c", 30, 410000, 522000, null),
    ],
    clock,
  );
  assert.deepEqual(out.map((l) => l.d), [0, 0, 0]);
});

test("skips events with no time, no accountId, or no readable location", () => {
  const out = extractLandings(
    [
      // No __t, so the clock reads null.
      { _T: "LogParachuteLanding", character: { accountId: "account.notime", location: { x: 410000, y: 522000 } } },
      { _T: "LogParachuteLanding", __t: 10, character: { location: { x: 410000, y: 522000 } } },
      { _T: "LogParachuteLanding", __t: 20, character: { accountId: "account.noloc" } },
      { _T: "LogParachuteLanding", __t: 25, character: { accountId: "account.nullloc", location: null } },
      // One axis missing outright: readXY rejects the whole location.
      { _T: "LogParachuteLanding", __t: 35, character: { accountId: "account.halfloc", location: { y: 500000 } } },
      { _T: "LogParachuteLanding", __t: 40 },
      null,
      undefined,
      { _T: "LogPlayerPosition", __t: 50, character: { accountId: "account.walker", location: { x: 1, y: 2 } } },
      landing("account.ok", 60, 700000, 800000, 12),
    ],
    clock,
  );
  assert.deepEqual(out, [{ a: "account.ok", t: 60, x: 7000, y: 8000, d: 12 }]);
});

test("a landing on the map edge with one zero axis still counts", () => {
  const out = extractLandings([landing("account.a", 10, 0, 500000, 3)], clock);
  assert.deepEqual(out, [{ a: "account.a", t: 10, x: 0, y: 5000, d: 3 }]);
});

test("keeps a landing at the exact map origin", () => {
  // readXY accepts 0,0; the "zero means absent" heuristic belongs to the
  // aircraft's vehicle.location in the flight module, not to a character's.
  const out = extractLandings([landing("account.a", 10, 0, 0, 3)], clock);
  assert.deepEqual(out, [{ a: "account.a", t: 10, x: 0, y: 0, d: 3 }]);
});

test("keeps a landing at t = 0", () => {
  const out = extractLandings(
    [landing("account.a", 30, 410000, 522000, 1), landing("account.a", 0, 200000, 200000, 2)],
    clock,
  );
  assert.deepEqual(out, [{ a: "account.a", t: 0, x: 2000, y: 2000, d: 2 }]);
});

test("returns an empty array for empty or malformed telemetry", () => {
  assert.deepEqual(extractLandings(null, clock), []);
  assert.deepEqual(extractLandings([], clock), []);
  assert.deepEqual(extractLandings(undefined, clock), []);
  assert.deepEqual(extractLandings({ not: "an array" }, clock), []);
});
