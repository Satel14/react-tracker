import {
  createShotWindow,
  flightSegment,
  planeAt,
  flightAlpha,
  landingsAlpha,
  specialZonesAt,
  healthArc,
  packagesAt,
} from "./replayLayers";

const SHOT_KEYS = ["t", "a", "v", "ax", "ay", "vx", "vy", "dmg"];

const packShots = (rows) => {
  const cols = {};
  for (const key of SHOT_KEYS) cols[key] = [];
  for (const row of rows) {
    for (const key of SHOT_KEYS) cols[key].push(row[key]);
  }
  return cols;
};

const shot = (t, ax) => ({ t, a: "att", v: "vic", ax, ay: ax + 1, vx: ax + 2, vy: ax + 3, dmg: 30 });

// ---------------------------------------------------------------- shot window

test("a shot is live from its own time until one lifetime later, exclusive", () => {
  const win = createShotWindow(packShots([shot(100, 1000)]));
  expect(win.activeAt(99.9, [])).toHaveLength(0);
  expect(win.activeAt(100, [])).toHaveLength(1);
  expect(win.activeAt(101.4, [])).toHaveLength(1);
  expect(win.activeAt(101.5, [])).toHaveLength(0);
  expect(win.activeAt(101.6, [])).toHaveLength(0);
});

test("an entry carries the raw metre endpoints and an age that runs 0 -> 1", () => {
  const win = createShotWindow(packShots([shot(100, 1000)]));
  expect(win.activeAt(100, [])[0]).toEqual({ ax: 1000, ay: 1001, vx: 1002, vy: 1003, age: 0 });
  const late = win.activeAt(101.4, [])[0];
  expect(late.age).toBeCloseTo(1.4 / 1.5, 10);
  expect(late.age).toBeLessThan(1);
  expect(win.activeAt(100.75, [])[0].age).toBeCloseTo(0.5, 10);
});

test("lifetimeSeconds is honoured", () => {
  const win = createShotWindow(packShots([shot(10, 500)]), { lifetimeSeconds: 3 });
  expect(win.activeAt(12.9, [])).toHaveLength(1);
  expect(win.activeAt(13, [])).toHaveLength(0);
  expect(win.activeAt(11.5, [])[0].age).toBeCloseTo(0.5, 10);
});

test("the cap keeps the newest shots when more than cap are live", () => {
  const rows = Array.from({ length: 200 }, (_, i) => shot(500 + i * 0.001, i));
  const out = createShotWindow(packShots(rows)).activeAt(500.5, []);
  expect(out).toHaveLength(80);
  expect(out[0].ax).toBe(120);
  expect(out[79].ax).toBe(199);
});

test("a custom cap also keeps the newest", () => {
  const rows = Array.from({ length: 10 }, (_, i) => shot(20 + i * 0.01, i));
  const out = createShotWindow(packShots(rows), { cap: 3 }).activeAt(20.5, []);
  expect(out.map((s) => s.ax)).toEqual([7, 8, 9]);
});

test("seeking backwards returns the earlier set", () => {
  const win = createShotWindow(packShots([shot(50, 1), shot(50, 2), shot(400, 3), shot(900, 4)]));
  expect(win.activeAt(900, []).map((s) => s.ax)).toEqual([4]);
  expect(win.activeAt(50, []).map((s) => s.ax)).toEqual([1, 2]);
  expect(win.activeAt(900, []).map((s) => s.ax)).toEqual([4]);
  expect(win.activeAt(400, []).map((s) => s.ax)).toEqual([3]);
  expect(win.activeAt(50.5, []).map((s) => s.ax)).toEqual([1, 2]);
});

test("successive calls reuse the same array and the same entry objects", () => {
  const win = createShotWindow(packShots([shot(50, 1), shot(50, 2)]));
  const out = [];
  const first = win.activeAt(50, out);
  expect(first).toBe(out);
  expect(out).toHaveLength(2);
  const entry0 = out[0];
  const entry1 = out[1];

  const second = win.activeAt(50.5, out);
  expect(second).toBe(out);
  expect(out).toHaveLength(2);
  expect(out[0]).toBe(entry0);
  expect(out[1]).toBe(entry1);
  expect(out[0].age).toBeCloseTo(0.5 / 1.5, 10);
});

test("out never keeps stale entries past the live count", () => {
  const win = createShotWindow(packShots([shot(50, 1), shot(50, 2), shot(900, 3)]));
  const out = [];
  win.activeAt(50, out);
  expect(out).toHaveLength(2);
  win.activeAt(900, out);
  expect(out).toHaveLength(1);
  expect(out[0].ax).toBe(3);
  win.activeAt(700, out);
  expect(out).toHaveLength(0);
});

test("an omitted out still returns one stable buffer", () => {
  const win = createShotWindow(packShots([shot(50, 1)]));
  const a = win.activeAt(50);
  const b = win.activeAt(50);
  expect(a).toBe(b);
  expect(a).toHaveLength(1);
});

test("empty, missing and junk shot input yields nothing", () => {
  for (const input of [null, undefined, {}, [], [1, 2, 3], "nope", { t: [] }, { t: null }]) {
    expect(createShotWindow(input).activeAt(10, [])).toHaveLength(0);
  }
});

test("shots with unusable coordinates are skipped rather than drawn at the origin", () => {
  const win = createShotWindow({ t: [10, 11], ax: [null, 2000], ay: [1, 2001], vx: [2, 2002], vy: [3, 2003] });
  const out = win.activeAt(11, []);
  expect(out).toHaveLength(1);
  expect(out[0].ax).toBe(2000);
});

test("the decoded array-of-objects shot shape is read too", () => {
  const win = createShotWindow([shot(100, 1000), shot(900, 2000)]);
  expect(win.activeAt(100, []).map((s) => s.ax)).toEqual([1000]);
  expect(win.activeAt(900, []).map((s) => s.ax)).toEqual([2000]);
});

// -------------------------------------------------------------------- flight

const crossOffLine = (flight, x, y) =>
  (x - flight.x1) * (flight.y2 - flight.y1) - (y - flight.y1) * (flight.x2 - flight.x1);

const expectOnLine = (flight, seg) => {
  expect(Math.abs(crossOffLine(flight, seg.x1, seg.y1))).toBeLessThan(1e-6);
  expect(Math.abs(crossOffLine(flight, seg.x2, seg.y2))).toBeLessThan(1e-6);
};

test("a diagonal through the centre clips to opposite corners", () => {
  const flight = { x1: 3000, y1: 3000, t1: 5, x2: 5000, y2: 5000, t2: 40, speed: 60 };
  const seg = flightSegment(flight, 8000);
  expect(seg.x1).toBeCloseTo(0, 9);
  expect(seg.y1).toBeCloseTo(0, 9);
  expect(seg.x2).toBeCloseTo(8000, 9);
  expect(seg.y2).toBeCloseTo(8000, 9);
  expectOnLine(flight, seg);
});

test("a horizontal line clips on x and keeps y", () => {
  const flight = { x1: 1000, y1: 4200, t1: 5, x2: 6000, y2: 4200, t2: 40, speed: 60 };
  const seg = flightSegment(flight, 8160);
  expect(seg.x1).toBeCloseTo(0, 9);
  expect(seg.x2).toBeCloseTo(8160, 9);
  expect(seg.y1).toBeCloseTo(4200, 9);
  expect(seg.y2).toBeCloseTo(4200, 9);
  expectOnLine(flight, seg);
});

test("a steep line clips on y, not x", () => {
  const flight = { x1: 4000, y1: 1000, t1: 5, x2: 4100, y2: 7000, t2: 40, speed: 60 };
  const seg = flightSegment(flight, 8160);
  expect(seg.y1).toBeCloseTo(0, 9);
  expect(seg.y2).toBeCloseTo(8160, 9);
  expect(seg.x1).toBeCloseTo(4000 - 1000 / 60, 9);
  expect(seg.x2).toBeCloseTo(4000 + 7160 / 60, 9);
  expect(seg.x1).toBeGreaterThan(0);
  expect(seg.x2).toBeLessThan(8160);
  expectOnLine(flight, seg);
});

test("a reversed flight still yields endpoints on the same infinite line", () => {
  const flight = { x1: 6100, y1: 5800, t1: 5, x2: 2200, y2: 900, t2: 40, speed: 60 };
  const seg = flightSegment(flight, 8160);
  expectOnLine(flight, seg);
  for (const v of [seg.x1, seg.y1, seg.x2, seg.y2]) {
    expect(v).toBeGreaterThanOrEqual(-1e-6);
    expect(v).toBeLessThanOrEqual(8160 + 1e-6);
  }
  // Both box edges are actually reached, so the corridor spans the map.
  const touches = [seg.x1, seg.y1, seg.x2, seg.y2].filter(
    (v) => Math.abs(v) < 1e-6 || Math.abs(v - 8160) < 1e-6,
  );
  expect(touches.length).toBeGreaterThanOrEqual(2);
});

test("a degenerate or missing flight yields null", () => {
  const valid = { x1: 1000, y1: 2000, t1: 5, x2: 3000, y2: 4000, t2: 40, speed: 60 };
  expect(flightSegment({ ...valid, x2: 1000, y2: 2000 }, 8160)).toBe(null);
  expect(flightSegment(null, 8160)).toBe(null);
  expect(flightSegment(undefined, 8160)).toBe(null);
  expect(flightSegment({}, 8160)).toBe(null);
  expect(flightSegment([], 8160)).toBe(null);
  expect(flightSegment({ x1: "a", y1: "b", x2: "c", y2: "d" }, 8160)).toBe(null);
  expect(flightSegment(valid, 0)).toBe(null);
  expect(flightSegment(valid, -100)).toBe(null);
  expect(flightSegment(valid, NaN)).toBe(null);
  expect(flightSegment(valid, Infinity)).toBe(null);
  expect(flightSegment(valid)).toBe(null);
});

test("a line whose whole extension misses the box yields null", () => {
  expect(flightSegment({ x1: 100, y1: 9000, x2: 5000, y2: 9000 }, 8160)).toBe(null);
  expect(flightSegment({ x1: -300, y1: 100, x2: -300, y2: 7000 }, 8160)).toBe(null);
});

// --------------------------------------------------------------------- plane

// 5400 m east and 1800 m north over 40 s, i.e. 135 / 45 m/s -- both exact in
// binary, so every expected position below is an exact metre value. The implied
// ground speed is 142.3 m/s, inside the 141.6-146.8 m/s measured band.
const diagFlight = { x1: 1000, y1: 1000, t1: 10, x2: 6400, y2: 2800, t2: 50, speed: 142.3 };

test("at the midpoint time the plane sits exactly halfway between the two jumps", () => {
  const p = planeAt(diagFlight, 30, 8160);
  expect(p.x).toBeCloseTo((diagFlight.x1 + diagFlight.x2) / 2, 9);
  expect(p.y).toBeCloseTo((diagFlight.y1 + diagFlight.y2) / 2, 9);
  expect(p.x).toBeCloseTo(3700, 9);
  expect(p.y).toBeCloseTo(1900, 9);
});

test("the plane is at each jump point at that jump's own time", () => {
  const first = planeAt(diagFlight, 10, 8160);
  expect(first.x).toBeCloseTo(1000, 9);
  expect(first.y).toBeCloseTo(1000, 9);
  const last = planeAt(diagFlight, 50, 8160);
  expect(last.x).toBeCloseTo(6400, 9);
  expect(last.y).toBeCloseTo(2800, 9);
});

test("extrapolating before the first jump stays on the line and behind it", () => {
  const p = planeAt(diagFlight, 4, 8160);
  expect(Math.abs(crossOffLine(diagFlight, p.x, p.y))).toBeLessThan(1e-6);
  expect(p.x).toBeCloseTo(190, 9);
  expect(p.y).toBeCloseTo(730, 9);
  // Behind the first jump, never ahead of it: a flipped sign would still land
  // on the line, so direction is pinned separately from collinearity.
  expect(p.x).toBeLessThan(diagFlight.x1);
  expect(p.y).toBeLessThan(diagFlight.y1);
});

test("extrapolating after the last jump stays on the line and ahead of it", () => {
  const p = planeAt(diagFlight, 55, 8160);
  expect(Math.abs(crossOffLine(diagFlight, p.x, p.y))).toBeLessThan(1e-6);
  expect(p.x).toBeCloseTo(7075, 9);
  expect(p.y).toBeCloseTo(3025, 9);
  expect(p.x).toBeGreaterThan(diagFlight.x2);
  expect(p.y).toBeGreaterThan(diagFlight.y2);
});

test("the heading is atan2 of the direction of travel", () => {
  const east = { x1: 1000, y1: 4000, t1: 0, x2: 6600, y2: 4000, t2: 40, speed: 140 };
  const north = { x1: 4000, y1: 500, t1: 0, x2: 4000, y2: 6100, t2: 40, speed: 140 };
  const west = { x1: 6600, y1: 4000, t1: 0, x2: 1000, y2: 4000, t2: 40, speed: 140 };
  expect(planeAt(east, 20, 8000).angle).toBeCloseTo(0, 12);
  // atan2(dy, dx), not atan2(dx, dy): a swapped pair would read 0 here.
  expect(planeAt(north, 20, 8000).angle).toBeCloseTo(Math.PI / 2, 12);
  expect(Math.abs(planeAt(west, 20, 8000).angle)).toBeCloseTo(Math.PI, 12);
});

test("the heading does not flip when extrapolating backwards", () => {
  const expected = Math.atan2(diagFlight.y2 - diagFlight.y1, diagFlight.x2 - diagFlight.x1);
  for (const t of [4, 9.5, 10, 30, 50, 55]) {
    expect(planeAt(diagFlight, t, 8160).angle).toBeCloseTo(expected, 12);
  }
});

// x = 1000 + 140 t, y parked at 4000, on a 8000 m box.
const horizFlight = { x1: 1000, y1: 4000, t1: 0, x2: 6600, y2: 4000, t2: 40, speed: 140 };

test("the plane is not drawn well before it enters or well after it leaves", () => {
  expect(planeAt(horizFlight, -20, 8000)).toBe(null);
  expect(planeAt(horizFlight, -100, 8000)).toBe(null);
  expect(planeAt(horizFlight, 60, 8000)).toBe(null);
  expect(planeAt(horizFlight, 600, 8000)).toBe(null);
  expect(planeAt(diagFlight, -200, 8160)).toBe(null);
  expect(planeAt(diagFlight, 200, 8160)).toBe(null);
});

test("the margin keeps the plane drawn at and just past the map edge", () => {
  // x = 0 exactly, then 120 m off the near edge.
  expect(planeAt(horizFlight, -50 / 7, 8000)).not.toBe(null);
  expect(planeAt(horizFlight, -8, 8000).x).toBeCloseTo(-120, 9);
  // x = 8000 exactly (the far edge), then 140 m past it.
  expect(planeAt(horizFlight, 50, 8000).x).toBeCloseTo(8000, 9);
  expect(planeAt(horizFlight, 51, 8000).x).toBeCloseTo(8140, 9);
});

test("the box is checked on y as well as on x", () => {
  const north = { x1: 4000, y1: 500, t1: 0, x2: 4000, y2: 6100, t2: 40, speed: 140 };
  expect(planeAt(north, 20, 8000).y).toBeCloseTo(3300, 9);
  expect(planeAt(north, 100, 8000)).toBe(null);
  expect(planeAt(north, -100, 8000)).toBe(null);
});

test("each call yields an independent result the caller may hold on to", () => {
  const early = planeAt(diagFlight, 12, 8160);
  const late = planeAt(diagFlight, 48, 8160);
  expect(early.x).toBeCloseTo(1270, 9);
  expect(early.y).toBeCloseTo(1090, 9);
  expect(late.x).toBeCloseTo(6130, 9);
  expect(late.y).toBeCloseTo(2710, 9);
});

test("a degenerate, missing or malformed plane input yields null", () => {
  const valid = diagFlight;
  // The two jump points coincide: no direction to fly.
  expect(planeAt({ ...valid, x2: valid.x1, y2: valid.y1 }, 30, 8160)).toBe(null);
  // Both jumps at the same instant: no time base to fly on.
  expect(planeAt({ ...valid, t2: valid.t1 }, 30, 8160)).toBe(null);
  expect(planeAt(null, 30, 8160)).toBe(null);
  expect(planeAt(undefined, 30, 8160)).toBe(null);
  expect(planeAt({}, 30, 8160)).toBe(null);
  expect(planeAt([], 30, 8160)).toBe(null);
  expect(planeAt("flight", 30, 8160)).toBe(null);
  expect(planeAt(valid, 30, 0)).toBe(null);
  expect(planeAt(valid, 30, -8160)).toBe(null);
  expect(planeAt(valid, 30, NaN)).toBe(null);
  expect(planeAt(valid, 30, Infinity)).toBe(null);
  expect(planeAt(valid, 30)).toBe(null);
  expect(planeAt(valid, NaN, 8160)).toBe(null);
  expect(planeAt(valid, Infinity, 8160)).toBe(null);
  expect(planeAt(valid, undefined, 8160)).toBe(null);
  expect(planeAt(valid, "30", 8160)).toBe(null);
  expect(planeAt(valid, null, 8160)).toBe(null);
  for (const key of ["x1", "y1", "t1", "x2", "y2", "t2"]) {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, "5", {}]) {
      expect(planeAt({ ...valid, [key]: bad }, 30, 8160)).toBe(null);
    }
  }
});

test("a realistic 6000 m / 42 s crossing implies the measured plane speed", () => {
  // 3600 / 4800 is a 6000 m separation on the integer-metre grid.
  const real = { x1: 1000, y1: 1000, t1: 33, x2: 4600, y2: 5800, t2: 75, speed: 142.857 };
  const a = planeAt(real, 33, 8160);
  const b = planeAt(real, 75, 8160);
  const implied = Math.hypot(b.x - a.x, b.y - a.y) / (real.t2 - real.t1);
  expect(implied).toBeCloseTo(6000 / 42, 9);
  expect(implied).toBeGreaterThan(141.6);
  expect(implied).toBeLessThan(146.8);
  // The derived velocity and the payload's own speed field agree.
  expect(implied).toBeCloseTo(real.speed, 2);
});

// -------------------------------------------------------------------- alphas

test("flightAlpha holds at 1, fades linearly, then sits at 0", () => {
  expect(flightAlpha(0)).toBe(1);
  expect(flightAlpha(89)).toBe(1);
  expect(flightAlpha(90)).toBe(1);
  expect(flightAlpha(105)).toBeCloseTo(0.5, 10);
  expect(flightAlpha(120)).toBe(0);
  expect(flightAlpha(1000)).toBe(0);
  expect(flightAlpha(60, { fadeStart: 60, fadeEnd: 80 })).toBe(1);
  expect(flightAlpha(70, { fadeStart: 60, fadeEnd: 80 })).toBeCloseTo(0.5, 10);
  expect(flightAlpha(80, { fadeStart: 60, fadeEnd: 80 })).toBe(0);
});

test("landingsAlpha fades later than the flight line", () => {
  expect(landingsAlpha(0)).toBe(1);
  expect(landingsAlpha(120)).toBe(1);
  expect(landingsAlpha(150)).toBeCloseTo(0.5, 10);
  expect(landingsAlpha(180)).toBe(0);
  expect(landingsAlpha(2000)).toBe(0);
});

test("both alphas survive junk input", () => {
  for (const fn of [flightAlpha, landingsAlpha]) {
    expect(fn(undefined)).toBe(1);
    expect(fn(NaN)).toBe(1);
    expect(fn("x")).toBe(1);
    expect(fn(null)).toBe(1);
    expect(fn(50, {})).toBe(1);
    expect(fn(50, null)).toBe(1);
    // A zero-width fade must not divide by zero.
    expect(fn(10, { fadeStart: 30, fadeEnd: 30 })).toBe(1);
    expect(fn(30, { fadeStart: 30, fadeEnd: 30 })).toBe(0);
  }
});

// --------------------------------------------------------------- special zones

const redZone = { type: "RedZone", uid: 7, t0: 300, t1: 360, r: 250, path: [{ t: 300, x: 4000, y: 5000 }] };
const emp = { type: "EMP", uid: 3, t0: 310, t1: 400, r: 400, path: [{ t: 310, x: 1200, y: 1300 }] };
const sandStorm = {
  type: "SandStorm",
  uid: 11,
  t0: 90,
  t1: 200,
  r: 900,
  path: [
    { t: 100, x: 0, y: 1000 },
    { t: 110, x: 100, y: 1000 },
    { t: 120, x: 200, y: 1100 },
    { t: 130, x: 300, y: 1100 },
    { t: 140, x: 400, y: 1200 },
  ],
};

test("a one-point zone reports that exact point for its whole window", () => {
  expect(specialZonesAt([redZone], 299.9, [])).toHaveLength(0);
  expect(specialZonesAt([redZone], 300, [])).toEqual([{ type: "RedZone", x: 4000, y: 5000, r: 250 }]);
  expect(specialZonesAt([redZone], 330, [])).toEqual([{ type: "RedZone", x: 4000, y: 5000, r: 250 }]);
  expect(specialZonesAt([redZone], 360, [])).toHaveLength(1);
  expect(specialZonesAt([redZone], 360.1, [])).toHaveLength(0);
});

test("a moving zone interpolates exactly halfway between two samples", () => {
  const out = specialZonesAt([sandStorm], 115, []);
  expect(out).toHaveLength(1);
  expect(out[0]).toEqual({ type: "SandStorm", x: 150, y: 1050, r: 900 });
  expect(specialZonesAt([sandStorm], 135, [])[0]).toEqual({
    type: "SandStorm",
    x: 350,
    y: 1150,
    r: 900,
  });
  expect(specialZonesAt([sandStorm], 120, [])[0].x).toBe(200);
  expect(specialZonesAt([sandStorm], 128, [])[0].x).toBeCloseTo(280, 10);
});

test("a moving zone clamps to its path ends instead of extrapolating", () => {
  const before = specialZonesAt([sandStorm], 90, [])[0];
  expect(before.x).toBe(0);
  expect(before.y).toBe(1000);
  const after = specialZonesAt([sandStorm], 200, [])[0];
  expect(after.x).toBe(400);
  expect(after.y).toBe(1200);
  expect(specialZonesAt([sandStorm], 95, [])[0].x).toBe(0);
  expect(specialZonesAt([sandStorm], 199, [])[0].x).toBe(400);
});

test("only the zones whose window covers t are reported", () => {
  const out = specialZonesAt([redZone, emp, sandStorm], 330, []);
  expect(out.map((z) => z.type)).toEqual(["RedZone", "EMP"]);
});

test("three zones live at the same instant all appear", () => {
  const overlapping = [
    { ...redZone, t0: 100, t1: 400 },
    { ...emp, t0: 100, t1: 400 },
    sandStorm,
  ];
  const out = specialZonesAt(overlapping, 115, []);
  expect(out).toHaveLength(3);
  expect(out.map((z) => z.type)).toEqual(["RedZone", "EMP", "SandStorm"]);
  expect(out[2]).toEqual({ type: "SandStorm", x: 150, y: 1050, r: 900 });
});

test("out is reused across zone calls", () => {
  const out = [];
  const a = specialZonesAt([sandStorm], 110, out);
  expect(a).toBe(out);
  const entry = out[0];
  const b = specialZonesAt([sandStorm], 115, out);
  expect(b).toBe(out);
  expect(out[0]).toBe(entry);
  expect(out[0].x).toBe(150);
  specialZonesAt([sandStorm], 900, out);
  expect(out).toHaveLength(0);
});

test("malformed zones never throw", () => {
  for (const input of [null, undefined, {}, "x", [null, 3, "z", {}, { path: [] }, { path: [{}] }]]) {
    expect(specialZonesAt(input, 120, [])).toHaveLength(0);
  }
  expect(specialZonesAt([{ type: "RedZone", t0: 0, t1: 100, path: [{ t: 0, x: 5, y: 6 }] }], 50, [])).toEqual([
    { type: "RedZone", x: 5, y: 6, r: 0 },
  ]);
});

// -------------------------------------------------------------------- health

test("health thresholds are steps, not a gradient", () => {
  expect(healthArc(0)).toEqual({ fraction: 0, level: "danger" });
  expect(healthArc(19)).toEqual({ fraction: 0.19, level: "danger" });
  // 19.9 / 100 is not exactly the double 0.199, so pin the level exactly and
  // the fraction to a tolerance.
  expect(healthArc(19.9).level).toBe("danger");
  expect(healthArc(19.9).fraction).toBeCloseTo(0.199, 12);
  expect(healthArc(20)).toEqual({ fraction: 0.2, level: "warn" });
  expect(healthArc(50)).toEqual({ fraction: 0.5, level: "warn" });
  expect(healthArc(51)).toEqual({ fraction: 0.51, level: "ok" });
  expect(healthArc(100)).toEqual({ fraction: 1, level: "ok" });
});

test("out-of-range and non-numeric health is safe", () => {
  expect(healthArc(150)).toEqual({ fraction: 1, level: "ok" });
  expect(healthArc(-5)).toEqual({ fraction: 0, level: "danger" });
  // A missing reading means "unhurt", never "dying".
  expect(healthArc(undefined)).toEqual({ fraction: 1, level: "ok" });
  expect(healthArc(null)).toEqual({ fraction: 1, level: "ok" });
  expect(healthArc(NaN)).toEqual({ fraction: 1, level: "ok" });
  expect(healthArc("40")).toEqual({ fraction: 1, level: "ok" });
  expect(healthArc({})).toEqual({ fraction: 1, level: "ok" });
});

// ------------------------------------------------------------------ packages

const crate = { kind: "small", id: "pkg-1", t: 75, ts: 60, x: 1000, y: 2000, n: 5 };
const orphan = { kind: "brdm", id: "pkg-2", t: 300, ts: null, x: 10, y: 20, n: 0 };

test("a package falls from its spawn time and stays once landed", () => {
  expect(packagesAt([crate], 59, [])).toHaveLength(0);
  expect(packagesAt([crate], 60, [])).toEqual([{ kind: "small", x: 1000, y: 2000, falling: true, fall: 0, looted: false }]);
  expect(packagesAt([crate], 74, [])[0].falling).toBe(true);
  expect(packagesAt([crate], 74.99, [])[0].falling).toBe(true);
  expect(packagesAt([crate], 75, [])[0].falling).toBe(false);
  expect(packagesAt([crate], 600, [])).toEqual([{ kind: "small", x: 1000, y: 2000, falling: false, fall: 1, looted: false }]);
});

test("an unpaired land appears at its land time and never falls", () => {
  expect(packagesAt([orphan], 299, [])).toHaveLength(0);
  expect(packagesAt([orphan], 300, [])).toEqual([{ kind: "brdm", x: 10, y: 20, falling: false, fall: 1, looted: false }]);
  expect(packagesAt([orphan], 900, [])[0].falling).toBe(false);
});

test("out is reused across package calls", () => {
  const out = [];
  const a = packagesAt([crate, orphan], 600, out);
  expect(a).toBe(out);
  expect(out).toHaveLength(2);
  const entry = out[0];
  packagesAt([crate, orphan], 700, out);
  expect(out[0]).toBe(entry);
  packagesAt([crate, orphan], 10, out);
  expect(out).toHaveLength(0);
});

test("malformed packages never throw", () => {
  for (const input of [null, undefined, {}, "x", [null, 7, {}, { t: "a" }, { t: 5, x: null, y: 1 }]]) {
    expect(packagesAt(input, 120, [])).toHaveLength(0);
  }
});

// ------------------------------------------------------------------- fuzzing

test("every export tolerates junk arguments", () => {
  const junk = [null, undefined, {}, [], "x", 0, NaN, [null], [{}], { t: "no" }];
  for (const a of junk) {
    for (const b of junk) {
      expect(() => createShotWindow(a, b).activeAt(a, [])).not.toThrow();
      expect(() => flightSegment(a, b)).not.toThrow();
      expect(() => planeAt(a, b, b)).not.toThrow();
      expect(() => planeAt(a, 30, b)).not.toThrow();
      expect(() => flightAlpha(a, b)).not.toThrow();
      expect(() => landingsAlpha(a, b)).not.toThrow();
      expect(() => specialZonesAt(a, b, [])).not.toThrow();
      expect(() => specialZonesAt(a, 100, b)).not.toThrow();
      expect(() => packagesAt(a, b, [])).not.toThrow();
      expect(() => packagesAt(a, 100, b)).not.toThrow();
      expect(() => healthArc(a)).not.toThrow();
    }
  }
});

test("a faded layer still reappears when the viewer scrubs back", () => {
  // The fades are a default, not a one-way door: the flight and landing
  // toggles would otherwise become permanent no-ops a couple of minutes in,
  // with a control that still looks live.
  expect(flightAlpha(30)).toBe(1);
  expect(flightAlpha(200)).toBe(0);
  expect(flightAlpha(30)).toBe(1);
  expect(landingsAlpha(60)).toBe(1);
  expect(landingsAlpha(300)).toBe(0);
  expect(landingsAlpha(60)).toBe(1);
});

test("a package reports how far through its fall it is", () => {
  // Spawn and land share x and y exactly -- the crate drops straight down, so
  // there is no movement to animate on a top-down map. Progress is what the
  // renderer has to work with instead.
  const out = [];
  const pkgs = [{ kind: "redbox", x: 100, y: 200, ts: 60, t: 90, lootedAt: null }];
  const fallAt = (t) => { packagesAt(pkgs, t, out); return out[0] && out[0].fall; };
  expect(fallAt(60)).toBeCloseTo(0, 6);
  expect(fallAt(75)).toBeCloseTo(0.5, 6);
  expect(fallAt(90)).toBeCloseTo(1, 6);
  // Once down it stays down, rather than looping.
  expect(fallAt(600)).toBeCloseTo(1, 6);
});

test("a package with no spawn time is simply already down", () => {
  // An unpaired land carries no ts, so there is no descent to show.
  const out = [];
  packagesAt([{ kind: "small", x: 1, y: 2, ts: null, t: 50, lootedAt: null }], 50, out);
  expect(out[0].falling).toBe(false);
  expect(out[0].fall).toBe(1);
});

test("a package is open from the moment somebody takes from it", () => {
  const out = [];
  const pkgs = [{ kind: "redbox", x: 1, y: 2, ts: 10, t: 20, lootedAt: 140 }];
  const lootedAt = (t) => { packagesAt(pkgs, t, out); return out[0].looted; };
  expect(lootedAt(50)).toBe(false);
  expect(lootedAt(139)).toBe(false);
  expect(lootedAt(140)).toBe(true);
  expect(lootedAt(900)).toBe(true);
});

test("a package nobody touched is never open", () => {
  const out = [];
  packagesAt([{ kind: "small", x: 1, y: 2, ts: 10, t: 20, lootedAt: null }], 999, out);
  expect(out[0].looted).toBe(false);
});
