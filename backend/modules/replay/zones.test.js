const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractSpecialZones, extractPhases } = require("./zones");

// Stands in for buildMatchClock: an event's time is whatever `t` it carries,
// and anything without a numeric `t` is unclocked.
const clock = { timeOf: (ev) => (typeof ev?.t === "number" ? ev.t : null) };

// Telemetry positions and radii are centimetres; the extractor emits metres.
function zone(t, { uid, type = "RedZone", x = 0, y = 0, r = 50000, state = "Prepare" } = {}) {
  return {
    _T: "LogSpecialZoneInCharacters",
    t,
    zoneInfo: {
      zoneType: type,
      position: { x, y, z: 5000 },
      horizontalRadius: r,
      uniqueId: uid,
      zoneState: state,
    },
  };
}

function phase(t, p) {
  return { _T: "LogPhaseChange", t, phase: p, playersInWhiteCircle: ["a", "b", "c"] };
}

test("three static instances each collapse to a one-point path", () => {
  // Shaped like a Taego/Erangel red zone run: uniqueId 0..2, position constant
  // within an instance, radius shrinking between instances.
  const spec = [
    { uid: 0, t: 300, x: 100000, y: 200000, r: 50000 },
    { uid: 1, t: 420, x: 310000, y: 410000, r: 47000 },
    { uid: 2, t: 540, x: 620000, y: 150000, r: 43600 },
  ];
  const telemetry = [];
  for (const s of spec) {
    for (let i = 0; i < 4; i += 1) {
      telemetry.push(zone(s.t + i * 5, { uid: s.uid, x: s.x, y: s.y, r: s.r }));
    }
  }

  const out = extractSpecialZones(telemetry, clock);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((z) => z.uid), [0, 1, 2]);
  assert.deepEqual(out.map((z) => z.type), ["RedZone", "RedZone", "RedZone"]);
  assert.deepEqual(out.map((z) => z.path.length), [1, 1, 1]);
  assert.deepEqual(out.map((z) => z.r), [500, 470, 436]);
  assert.deepEqual(out.map((z) => [z.t0, z.t1]), [[300, 315], [420, 435], [540, 555]]);
  assert.deepEqual(out[0].path, [{ t: 300, x: 1000, y: 2000 }]);
});

test("path and radius share one unit: integer metres", () => {
  // Raw telemetry is centimetres. Both halves of the payload divide by 100, so
  // the circle lands in the right place AND at the right size.
  const [z] = extractSpecialZones([zone(300, { uid: 0, x: 555200, y: 270400, r: 50000 })], clock);
  assert.deepEqual(z.path, [{ t: 300, x: 5552, y: 2704 }]);
  assert.equal(z.r, 500);
});

test("a moving zone keeps every distinct position", () => {
  const track = [
    [100000, 100000],
    [110000, 100000],
    [120000, 105000],
    [130000, 110000],
    [140000, 110000],
  ];
  const moving = track.map(([x, y], i) => zone(60 + i * 10, { uid: 7, type: "SandStorm", x, y, r: 16700 }));

  const out = extractSpecialZones(moving, clock);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "SandStorm");
  assert.equal(out[0].r, 167);
  assert.deepEqual(out[0].path, [
    { t: 60, x: 1000, y: 1000 },
    { t: 70, x: 1100, y: 1000 },
    { t: 80, x: 1200, y: 1050 },
    { t: 90, x: 1300, y: 1100 },
    { t: 100, x: 1400, y: 1100 },
  ]);
});

test("consecutive repeats of one position collapse to a single point", () => {
  const A = [100000, 100000];
  const B = [200000, 100000];
  const C = [300000, 100000];
  const events = [A, A, B, B, B, C, C].map(([x, y], i) =>
    zone(10 + i, { uid: 3, type: "SandStorm", x, y, r: 16700 }),
  );

  const [z] = extractSpecialZones(events, clock);
  assert.equal(z.path.length, 3);
  assert.deepEqual(z.path.map((p) => p.t), [10, 12, 15]);
  assert.deepEqual(z.path.map((p) => p.x), [1000, 2000, 3000]);
});

test("dedup compares the rounded position, so sub-metre jitter collapses", () => {
  const events = [
    zone(10, { uid: 1, type: "SandStorm", x: 100000, y: 100000 }),
    zone(11, { uid: 1, type: "SandStorm", x: 100010, y: 100049 }), // still 1000 m, 1000 m
    zone(12, { uid: 1, type: "SandStorm", x: 100050, y: 100000 }), // 1000.5 rounds up to 1001 m
  ];

  const [z] = extractSpecialZones(events, clock);
  assert.deepEqual(z.path, [
    { t: 10, x: 1000, y: 1000 },
    { t: 12, x: 1001, y: 1000 },
  ]);
});

test("a returning position is re-appended, only consecutive repeats collapse", () => {
  const events = [
    zone(10, { uid: 1, type: "SandStorm", x: 100000, y: 0 }),
    zone(11, { uid: 1, type: "SandStorm", x: 200000, y: 0 }),
    zone(12, { uid: 1, type: "SandStorm", x: 100000, y: 0 }),
  ];

  const [z] = extractSpecialZones(events, clock);
  assert.deepEqual(z.path.map((p) => p.x), [1000, 2000, 1000]);
});

test("the radius is metres and the last reading in the group wins", () => {
  const shrinking = [
    zone(10, { uid: 1, r: 50000 }),
    zone(20, { uid: 1, r: 48000 }),
    zone(30, { uid: 1, r: 43649 }),
  ];
  assert.equal(extractSpecialZones(shrinking, clock)[0].r, 436);
  assert.equal(extractSpecialZones([zone(10, { uid: 1, r: 50000 })], clock)[0].r, 500);
});

test("t0 and t1 are the extremes of the group whatever the arrival order", () => {
  const events = [
    zone(220, { uid: 4 }),
    zone(60, { uid: 4 }),
    zone(140, { uid: 4 }),
  ];

  const [z] = extractSpecialZones(events, clock);
  assert.equal(z.t0, 60);
  assert.equal(z.t1, 220);
});

test("entries are sorted by t0 ascending", () => {
  const events = [
    zone(500, { uid: 9, x: 0, y: 0 }),
    zone(120, { uid: 2, x: 10000, y: 0 }),
    zone(300, { uid: 5, x: 20000, y: 0 }),
  ];
  assert.deepEqual(extractSpecialZones(events, clock).map((z) => z.uid), [2, 5, 9]);
});

test("uniqueId 0 is a real instance, not a missing id", () => {
  const out = extractSpecialZones([zone(10, { uid: 0, type: "EMP" })], clock);
  assert.equal(out.length, 1);
  assert.equal(out[0].uid, 0);
  assert.equal(out[0].type, "EMP");
});

test("two zone types that reuse one uniqueId stay separate instances", () => {
  // No observed match runs two zone systems at once, but nothing in the
  // telemetry guarantees it, and merging them would be silent.
  const events = [
    zone(100, { uid: 0, type: "SandStorm", x: 100000, y: 100000, r: 16700 }),
    zone(110, { uid: 0, type: "RedZone", x: 700000, y: 700000, r: 50000 }),
    zone(120, { uid: 0, type: "SandStorm", x: 120000, y: 100000, r: 16700 }),
    zone(130, { uid: 0, type: "RedZone", x: 700000, y: 700000, r: 50000 }),
  ];

  const out = extractSpecialZones(events, clock);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((z) => z.type), ["SandStorm", "RedZone"]);
  assert.deepEqual(out.map((z) => z.uid), [0, 0]);
  assert.deepEqual(out.map((z) => z.r), [167, 500]);
  assert.deepEqual(out.map((z) => [z.t0, z.t1]), [[100, 120], [110, 130]]);
  assert.deepEqual(out[0].path, [{ t: 100, x: 1000, y: 1000 }, { t: 120, x: 1200, y: 1000 }]);
  assert.deepEqual(out[1].path, [{ t: 110, x: 7000, y: 7000 }]);
});

test("unclocked events and unreadable positions are skipped", () => {
  const events = [
    zone(null, { uid: 1, x: 100000, y: 100000 }),
    {
      _T: "LogSpecialZoneInCharacters",
      t: 20,
      zoneInfo: { zoneType: "RedZone", position: { x: "nope", y: 1 }, horizontalRadius: 50000, uniqueId: 1 },
    },
    zone(30, { uid: 1, x: 100000, y: 100000 }),
  ];

  const out = extractSpecialZones(events, clock);
  assert.equal(out.length, 1);
  assert.equal(out[0].t0, 30);
  assert.equal(out[0].t1, 30);
  assert.deepEqual(out[0].path, [{ t: 30, x: 1000, y: 1000 }]);
});

test("a group whose every event is unusable produces no entry", () => {
  const events = [zone(null, { uid: 1 }), zone(null, { uid: 1 })];
  assert.deepEqual(extractSpecialZones(events, clock), []);
});

test("only LogSpecialZoneInCharacters events feed the zone extractor", () => {
  const events = [
    { _T: "LogGameStatePeriodic", t: 5, gameState: { safetyZoneRadius: 400000 } },
    zone(10, { uid: 1, x: 100000, y: 100000 }),
    phase(15, 2),
  ];
  const out = extractSpecialZones(events, clock);
  assert.equal(out.length, 1);
  assert.equal(out[0].uid, 1);
});

test("paired phase events collapse to one entry per phase with the earliest time", () => {
  const events = [phase(0, 1), phase(2, 1), phase(120, 2), phase(122, 2), phase(240, 3), phase(241, 3)];
  assert.deepEqual(extractPhases(events, clock), [
    { t: 0, p: 1 },
    { t: 120, p: 2 },
    { t: 240, p: 3 },
  ]);
});

test("the earliest phase time wins even when the pair arrives out of order", () => {
  assert.deepEqual(extractPhases([phase(130, 2), phase(120, 2)], clock), [{ t: 120, p: 2 }]);
});

test("phases are sorted by t ascending", () => {
  const out = extractPhases([phase(240, 3), phase(0, 1), phase(120, 2)], clock);
  assert.deepEqual(out.map((e) => e.p), [1, 2, 3]);
});

test("unclocked or non-numeric phase events are skipped", () => {
  const events = [
    { _T: "LogPhaseChange", phase: 4 },
    { _T: "LogPhaseChange", t: 10, phase: "5" },
    { _T: "LogPhaseChange", t: 20, phase: null },
    { _T: "LogPhaseChange", t: 25 },
    phase(30, 6),
  ];
  assert.deepEqual(extractPhases(events, clock), [{ t: 30, p: 6 }]);
});

test("only LogPhaseChange events feed the phase extractor", () => {
  const events = [
    { _T: "LogGameStatePeriodic", t: 5, phase: 9 },
    zone(10, { uid: 1 }),
    phase(15, 2),
  ];
  assert.deepEqual(extractPhases(events, clock), [{ t: 15, p: 2 }]);
});

test("malformed input never throws", () => {
  for (const bad of [null, undefined, [], {}, "nope", 42]) {
    assert.deepEqual(extractSpecialZones(bad, clock), []);
    assert.deepEqual(extractPhases(bad, clock), []);
  }

  const junk = [
    null,
    undefined,
    {},
    "string event",
    { _T: "LogSpecialZoneInCharacters" },
    { _T: "LogSpecialZoneInCharacters", t: 5, zoneInfo: null },
    { _T: "LogSpecialZoneInCharacters", t: 5, zoneInfo: { uniqueId: 1 } },
    { _T: "LogSpecialZoneInCharacters", t: 5, zoneInfo: { position: { x: 0, y: 0 }, horizontalRadius: 1 } },
    { _T: "LogPhaseChange" },
  ];
  assert.deepEqual(extractSpecialZones(junk, clock), []);
  assert.deepEqual(extractPhases(junk, clock), []);

  // A missing or broken clock must not take the parse down either.
  assert.deepEqual(extractSpecialZones([zone(10, { uid: 1 })], null), []);
  assert.deepEqual(extractPhases([phase(10, 1)], undefined), []);
  const angry = { timeOf: () => { throw new Error("clock exploded"); } };
  assert.deepEqual(extractSpecialZones([zone(10, { uid: 1 })], angry), []);
  assert.deepEqual(extractPhases([phase(10, 1)], angry), []);
});
