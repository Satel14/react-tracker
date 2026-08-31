import {
  drawScene, drawBackground, pickIndex, SCREEN,
  paintFlight, paintLandings, paintPackages, paintSpecialZones, paintShots,
} from "./replayScene";
import { buildTracks, sampleTracks } from "./replayTracks";
import { fitCamera, clampCamera, worldToScreen } from "./replayCamera";

const recordingCtx = () => {
  const calls = [];
  const state = { lineWidth: 0, fillStyle: "", strokeStyle: "", font: "", globalAlpha: 1 };
  const saved = [];
  const rec = (name) => (...args) => calls.push({ name, args, lineWidth: state.lineWidth, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, globalAlpha: state.globalAlpha });
  return {
    calls,
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v) { state.lineWidth = v; },
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v) { state.strokeStyle = v; },
    get font() { return state.font; },
    set font(v) { state.font = v; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v) { state.globalAlpha = v; },
    // globalAlpha is drawing state, so save/restore has to carry it.
    save: (...a) => { saved.push(state.globalAlpha); return rec("save")(...a); },
    restore: (...a) => { const r = rec("restore")(...a); if (saved.length) state.globalAlpha = saved.pop(); return r; },
    beginPath: rec("beginPath"), closePath: rec("closePath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"),
    arc: rec("arc"), rect: rec("rect"),
    fill: rec("fill"), stroke: rec("stroke"),
    clearRect: rec("clearRect"), fillRect: rec("fillRect"),
    drawImage: rec("drawImage"), fillText: rec("fillText"),
    measureText: () => ({ width: 40 }),
    setLineDash: rec("setLineDash"),
  };
};

const COLORS = {
  focal: "rgb(1,1,1)", enemy: "rgb(2,2,2)", dead: "rgb(3,3,3)", tracer: "rgb(4,4,4)",
  zoneCurrent: "rgb(5,5,5)", zoneNext: "rgb(6,6,6)", outside: "rgba(7,7,7,0.4)",
  ring: "rgb(8,8,8)", label: "rgb(9,9,9)", band: "rgb(10,10,10)",
  // Distinct, and present at all: both were missing, so every assertion about
  // them compared undefined to undefined and a mutation collapsing the two
  // damage colours into one passed.
  danger: "rgb(11,11,11)", healthOk: "rgb(12,12,12)",
};

const MAP = 8160;
const players = [
  { name: "Me", accountId: "a.me", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000 }, { t: 10, x: 4100, y: 4100 }] },
  { name: "Foe", accountId: "a.foe", teamId: 2, isFocal: false, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 3500, y: 4300 }, { t: 10, x: 3500, y: 4300 }] },
];
const zone = { bx: 4000, by: 4000, br: 2000, wx: 4500, wy: 4200, wr: 900, phase: 2 };

const frameAt = (zoom) => ({
  cam: clampCamera({ ...fitCamera(MAP), zoom }, 1168, 657),
  vw: 1168, vh: 657,
  tracks: sampleTracks(buildTracks(players), 5),
  zone, flashes: [], nowMs: 1000, focusedAccountId: null, hoveredIndex: -1,
  colors: COLORS, atlas: null,
});

const arcsOf = (ctx) => ctx.calls.filter((c) => c.name === "arc");

test("marker radii and line widths are identical at zoom 1 and zoom 6", () => {
  // zone: null so every recorded arc is a marker or a ring -- no magic-number
  // split between "marker-sized" and "zone-sized" radii is needed. One player
  // selected and the other hovered so both draw a ring, giving the width
  // comparison real strokes to pin instead of two empty arrays.
  const overrides = { zone: null, focusedAccountId: "a.me", hoveredIndex: 1 };
  const a = recordingCtx(); drawScene(a, { ...frameAt(1), ...overrides });
  const b = recordingCtx(); drawScene(b, { ...frameAt(6), ...overrides });
  const radii = (ctx) => arcsOf(ctx).map((c) => c.args[2]).sort((x, y) => x - y);
  expect(radii(a)).toEqual(radii(b));
  const widths = (ctx) => ctx.calls.filter((c) => c.name === "stroke").map((c) => c.lineWidth);
  expect(widths(a)).toEqual(widths(b));
});

// The fallback ctx.arc path above is NOT what ships: in a real browser buildAtlas
// succeeds and every marker goes through atlas.blit, which no other test reaches
// (jsdom has no Path2D, the logic project has no document). Pin the blit radius
// too, or a scale factor introduced inside blit would ship unseen.
test("atlas markers blit at the same radius at zoom 1 and zoom 6", () => {
  const recordingAtlas = () => {
    const radii = [];
    return { radii, blit: (_target, _kind, _x, _y, r) => radii.push(r) };
  };
  const overrides = { zone: null, focusedAccountId: "a.me", hoveredIndex: 1 };
  const a = recordingAtlas();
  const b = recordingAtlas();
  drawScene(recordingCtx(), { ...frameAt(1), ...overrides, atlas: a });
  drawScene(recordingCtx(), { ...frameAt(6), ...overrides, atlas: b });
  expect(a.radii).toEqual([SCREEN.selectedRadius, SCREEN.dotRadius]);
  expect(b.radii).toEqual(a.radii);
});

test("zone radii DO scale with zoom, by exactly the zoom factor", () => {
  const a = recordingCtx(); drawScene(a, frameAt(1));
  const b = recordingCtx(); drawScene(b, frameAt(2));
  const big = (ctx) => Math.max(...arcsOf(ctx).map((c) => c.args[2]));
  expect(big(b) / big(a)).toBeCloseTo(2, 6);
});

test("draws one marker per present player at the camera-projected position", () => {
  const ctx = recordingCtx();
  const frame = frameAt(1);
  drawScene(ctx, frame);
  const markers = arcsOf(ctx).filter((c) => c.args[2] <= 20);
  expect(markers.length).toBeGreaterThanOrEqual(2);

  const b = (Math.min(frame.vw, frame.vh) / MAP) * frame.cam.zoom;
  const expectedX = (frame.tracks.outX[0] - frame.cam.cx) * b + frame.vw / 2;
  const expectedY = (frame.tracks.outY[0] - frame.cam.cy) * b + frame.vh / 2;
  const focal = markers.find((c) => c.args[2] === 7);
  expect(focal.args[0]).toBeCloseTo(expectedX, 6);
  expect(focal.args[1]).toBeCloseTo(expectedY, 6);
});

test("fills each marker with the colour for its role and state", () => {
  const withDead = [
    ...players,
    { name: "Dead", accountId: "a.dead", teamId: 3, isFocal: false, dropTime: null, deathTime: 2,
      positions: [{ t: 0, x: 4200, y: 3900 }, { t: 10, x: 4200, y: 3900 }] },
  ];
  const ctx = recordingCtx();
  const frame = { ...frameAt(1), tracks: sampleTracks(buildTracks(withDead), 5) };
  drawScene(ctx, frame);
  // ctx.fill() with no args is a marker fill; the zone's ctx.fill("evenodd") is excluded.
  const fills = ctx.calls.filter((c) => c.name === "fill" && c.args.length === 0).map((c) => c.fillStyle);
  expect(fills).toEqual([COLORS.focal, COLORS.enemy, COLORS.dead]);
});

test("skips absent players entirely", () => {
  const ctx = recordingCtx();
  const frame = frameAt(1);
  frame.tracks = sampleTracks(buildTracks([{ ...players[0], dropTime: 100 }, players[1]]), 5);
  drawScene(ctx, frame);
  const markers = arcsOf(ctx).filter((c) => c.args[2] <= 20);
  expect(markers).toHaveLength(1);
});

test("fades a flash by its wall-clock age", () => {
  const ctx = recordingCtx();
  const frame = frameAt(1);
  frame.flashes = [{ bornMs: 600, kx: 4000, ky: 4000, vx: 2000, vy: 6000 }];
  frame.nowMs = 1200;
  drawScene(ctx, frame);
  expect(ctx.calls.some((c) => c.name === "lineTo")).toBe(true);
});

test("a flash with no killer position draws no tracer", () => {
  const ctx = recordingCtx();
  const frame = frameAt(1);
  frame.flashes = [{ bornMs: 1000, kx: null, ky: null, vx: 2000, vy: 6000 }];
  drawScene(ctx, frame);
  expect(ctx.calls.some((c) => c.name === "lineTo")).toBe(false);
});

test("labels only the focal, hovered and selected players, up to the cap", () => {
  const ctx = recordingCtx();
  const frame = frameAt(1);
  drawScene(ctx, frame);
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toEqual(["Me"]);
});

test("labels the hovered non-focal player too", () => {
  const ctx = recordingCtx();
  const frame = { ...frameAt(1), hoveredIndex: 1 };
  drawScene(ctx, frame);
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toEqual(["Me", "Foe"]);
});

test("labels the selected non-focal player too", () => {
  const ctx = recordingCtx();
  const frame = { ...frameAt(1), focusedAccountId: "a.foe" };
  drawScene(ctx, frame);
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toEqual(["Me", "Foe"]);
});

test("truncates labels at labelCap", () => {
  const ctx = recordingCtx();
  const frame = { ...frameAt(1), focusedAccountId: "a.foe", labelCap: 1 };
  drawScene(ctx, frame);
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toHaveLength(1);
});

test("drawBackground blits the map as a square and paints the bands", () => {
  const ctx = recordingCtx();
  drawBackground(ctx, { cam: fitCamera(MAP), vw: 1600, vh: 900, image: { width: 2048, height: 2048 }, bandColor: COLORS.band });
  const blit = ctx.calls.find((c) => c.name === "drawImage");
  expect(blit.args[3]).toBeCloseTo(900, 6);      // side
  expect(blit.args[4]).toBeCloseTo(900, 6);
  expect(blit.args[1]).toBeCloseTo(350, 6);      // (1600-900)/2
  expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(true);
});

test("drawBackground with no image still clears and paints the band", () => {
  const ctx = recordingCtx();
  drawBackground(ctx, { cam: fitCamera(MAP), vw: 1600, vh: 900, image: null, bandColor: COLORS.band });
  expect(ctx.calls.some((c) => c.name === "drawImage")).toBe(false);
  expect(ctx.calls.some((c) => c.name === "clearRect")).toBe(true);
});

test("pickIndex returns the nearest marker within the pick radius, or -1", () => {
  const frame = frameAt(1);
  const { cam, vw, vh, tracks } = frame;
  const s = { x: 0, y: 0 };
  // Project player 0 and click one pixel away.
  const b = (Math.min(vw, vh) / MAP) * cam.zoom;
  s.x = (tracks.outX[0] - cam.cx) * b + vw / 2;
  s.y = (tracks.outY[0] - cam.cy) * b + vh / 2;
  expect(pickIndex(tracks, cam, vw, vh, s.x + 1, s.y + 1)).toBe(0);
  expect(pickIndex(tracks, cam, vw, vh, 5, 5)).toBe(-1);
});

// ---------------------------------------------------------------------------
// P2 layers. Every one of these is drawn from data produced by replayLayers.js,
// so what is pinned here is the TRANSLATION: screen-space vs world-space sizing,
// culling, and layer flags. The decisions themselves are tested next door.
// ---------------------------------------------------------------------------

const P2_COLORS = {
  ...COLORS,
  warn: "rgb(11,11,11)", zoneRed: "rgb(12,12,12)", zoneStorm: "rgb(13,13,13)",
  zoneEmp: "rgb(14,14,14)", crate: "rgb(15,15,15)", flight: "rgb(16,16,16)",
  danger: "rgb(17,17,17)", healthOk: "rgb(18,18,18)", healthLow: "rgb(19,19,19)",
};

const lineWidths = (ctx) => ctx.calls.filter((c) => c.name === "stroke").map((c) => c.lineWidth);
const linesOf = (ctx) => ctx.calls.filter((c) => c.name === "lineTo");

test("the flight line is world-positioned but screen-width", () => {
  const seg = { x1: 0, y1: 0, x2: MAP, y2: MAP };
  const a = recordingCtx();
  const b = recordingCtx();
  paintFlight(a, { ...frameAt(1), segment: seg, alpha: 1, colors: P2_COLORS });
  paintFlight(b, { ...frameAt(6), segment: seg, alpha: 1, colors: P2_COLORS });
  // Width identical at both zooms...
  expect(lineWidths(a)).toEqual(lineWidths(b));
  expect(lineWidths(a)).toEqual([SCREEN.flightWidth]);
  // ...but the endpoints move, because the line is anchored in the world.
  expect(linesOf(a)[0].args).not.toEqual(linesOf(b)[0].args);
});

test("a faded-out flight line is not drawn at all", () => {
  const ctx = recordingCtx();
  paintFlight(ctx, { ...frameAt(1), segment: { x1: 0, y1: 0, x2: MAP, y2: MAP }, alpha: 0, colors: P2_COLORS });
  expect(ctx.calls.filter((c) => c.name === "stroke")).toHaveLength(0);
});

test("special zone radii scale with zoom by exactly the zoom factor", () => {
  const zones = [{ type: "RedZone", x: 4000, y: 4000, r: 500 }];
  const a = recordingCtx();
  const b = recordingCtx();
  paintSpecialZones(a, { ...frameAt(1), zones, colors: P2_COLORS });
  paintSpecialZones(b, { ...frameAt(3), zones, colors: P2_COLORS });
  const rA = arcsOf(a).map((c) => c.args[2]);
  const rB = arcsOf(b).map((c) => c.args[2]);
  expect(rA).toHaveLength(1);
  expect(rB[0] / rA[0]).toBeCloseTo(3, 6);
});

test("each special zone type gets its own fill, and an unknown type still draws", () => {
  const seen = (type) => {
    const ctx = recordingCtx();
    paintSpecialZones(ctx, { ...frameAt(1), zones: [{ type, x: 4000, y: 4000, r: 500 }], colors: P2_COLORS });
    const fills = ctx.calls.filter((c) => c.name === "fill");
    return fills.length ? fills[0].fillStyle : null;
  };
  const red = seen("RedZone");
  const storm = seen("SandStorm");
  const emp = seen("EMP");
  expect(new Set([red, storm, emp]).size).toBe(3);
  // A type PUBG has not shipped yet must not vanish silently.
  expect(seen("SomeFutureHazard")).not.toBeNull();
});

test("a special zone entirely off-screen is culled before drawing", () => {
  const ctx = recordingCtx();
  paintSpecialZones(ctx, {
    ...frameAt(6),
    zones: [{ type: "RedZone", x: 100, y: 100, r: 50 }],
    colors: P2_COLORS,
  });
  expect(arcsOf(ctx)).toHaveLength(0);
});

test("shot lines fade by age and are culled when both ends are off-screen", () => {
  const onScreen = { ax: 4000, ay: 4000, vx: 4100, vy: 4100, age: 0 };
  const offScreen = { ax: 50, ay: 50, vx: 60, vy: 60, age: 0 };
  const ctx = recordingCtx();
  paintShots(ctx, { ...frameAt(6), shots: [onScreen, offScreen], colors: P2_COLORS });
  expect(ctx.calls.filter((c) => c.name === "stroke")).toHaveLength(1);

  // Alpha tracks age: a fresh line is opaque, an old one nearly gone.
  const alphas = [];
  const probe = recordingCtx();
  const orig = Object.getOwnPropertyDescriptor(probe, "globalAlpha");
  Object.defineProperty(probe, "globalAlpha", {
    get: orig.get,
    set(v) { alphas.push(v); orig.set.call(probe, v); },
  });
  paintShots(probe, {
    ...frameAt(1),
    shots: [{ ...onScreen, age: 0 }, { ...onScreen, age: 0.75 }],
    colors: P2_COLORS,
  });
  expect(alphas[0]).toBeCloseTo(1, 6);
  expect(alphas[1]).toBeCloseTo(0.25, 6);
});

test("shot line width is constant across zoom", () => {
  const shots = [{ ax: 4000, ay: 4000, vx: 4100, vy: 4100, age: 0 }];
  const a = recordingCtx();
  const b = recordingCtx();
  paintShots(a, { ...frameAt(1), shots, colors: P2_COLORS });
  paintShots(b, { ...frameAt(6), shots, colors: P2_COLORS });
  expect(lineWidths(a)).toEqual(lineWidths(b));
});

test("packages draw at a constant screen size and a falling crate is marked", () => {
  const pkgs = [{ kind: "redbox", x: 4000, y: 4000, falling: false }];
  const a = recordingCtx();
  const b = recordingCtx();
  paintPackages(a, { ...frameAt(1), packages: pkgs, colors: P2_COLORS, atlas: null });
  paintPackages(b, { ...frameAt(6), packages: pkgs, colors: P2_COLORS, atlas: null });
  expect(arcsOf(a).map((c) => c.args[2])).toEqual(arcsOf(b).map((c) => c.args[2]));

  // A falling crate is drawn differently from a landed one, or the drop is invisible.
  const landed = recordingCtx();
  const falling = recordingCtx();
  paintPackages(landed, { ...frameAt(1), packages: [{ kind: "small", x: 4000, y: 4000, falling: false }], colors: P2_COLORS, atlas: null });
  paintPackages(falling, { ...frameAt(1), packages: [{ kind: "small", x: 4000, y: 4000, falling: true }], colors: P2_COLORS, atlas: null });
  expect(landed.calls.length).not.toBe(falling.calls.length);
});

test("landings honour the layer alpha and cull off-screen", () => {
  const landings = [{ a: "a.me", x: 4000, y: 4000 }, { a: "a.far", x: 50, y: 50 }];
  const ctx = recordingCtx();
  paintLandings(ctx, { ...frameAt(6), landings, alpha: 1, colors: P2_COLORS, atlas: null, focalIds: new Set(["a.me"]) });
  // Only the on-screen one survives the cull at zoom 6.
  expect(arcsOf(ctx).length + ctx.calls.filter((c) => c.name === "lineTo").length).toBeGreaterThan(0);
  const faded = recordingCtx();
  paintLandings(faded, { ...frameAt(1), landings, alpha: 0, colors: P2_COLORS, atlas: null, focalIds: new Set() });
  expect(faded.calls).toHaveLength(0);
});

test("layer flags switch each optional layer off inside drawScene", () => {
  const wounded = [{
    name: "Hurt", accountId: "a.hurt", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000, h: 40, f: 0 }, { t: 10, x: 4000, y: 4000, h: 40, f: 0 }],
  }];
  const rich = {
    ...frameAt(1),
    colors: P2_COLORS,
    tracks: sampleTracks(buildTracks(wounded), 5),
    shots: [{ ax: 4000, ay: 4000, vx: 4100, vy: 4100, age: 0 }],
    specialZones: [{ type: "RedZone", x: 4000, y: 4000, r: 500 }],
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: false }],
    landings: [{ a: "a.me", x: 4000, y: 4000 }],
    flightSeg: { x1: 0, y1: 0, x2: MAP, y2: MAP },
    flightAlpha: 1,
    landingsAlpha: 1,
  };
  const all = recordingCtx();
  drawScene(all, rich);
  const none = recordingCtx();
  drawScene(none, {
    ...rich,
    layers: { shots: false, landings: false, flight: false, packages: false, specialZones: false, healthArcs: false },
  });
  expect(none.calls.length).toBeLessThan(all.calls.length);

  // And each flag is individually load-bearing, not just the bundle.
  for (const key of ["shots", "landings", "flight", "packages", "specialZones", "healthArcs"]) {
    const off = recordingCtx();
    drawScene(off, { ...rich, layers: { [key]: false } });
    expect(off.calls.length, `${key} flag did nothing`).toBeLessThan(all.calls.length);
  }
});

// A player's state changes which glyph is asked for. The atlas bakes one colour
// per cell, so friend/foe must be part of the kind or a knocked teammate blits
// in the enemy colour -- the single distinction that matters most, inverted at
// exactly the moment the player needs watching.
test("state picks the glyph, and friend/foe survives the state change", () => {
  const kindsFor = (h, f, isFocal) => {
    const kinds = [];
    const atlas = { blit: (_c, kind) => kinds.push(kind) };
    const stateful = [{
      name: "P", accountId: "a.p", teamId: 1, isFocal, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4000, y: 4000, h, f }, { t: 10, x: 4000, y: 4000, h, f }],
    }];
    drawScene(recordingCtx(), {
      ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
      tracks: sampleTracks(buildTracks(stateful), 5),
    });
    return kinds;
  };
  expect(kindsFor(100, 0, true)).toEqual(["focal"]);
  expect(kindsFor(100, 0, false)).toEqual(["enemy"]);
  expect(kindsFor(100, 1, true)).toEqual(["vehicleFocal"]);
  expect(kindsFor(100, 1, false)).toEqual(["vehicleEnemy"]);
  expect(kindsFor(30, 2, true)).toEqual(["knockedFocal"]);
  expect(kindsFor(30, 2, false)).toEqual(["knockedEnemy"]);
  // Knocked wins over in-vehicle: being downed is the more urgent read.
  expect(kindsFor(30, 3, true)).toEqual(["knockedFocal"]);
});

test("a dead player stays the X glyph whatever their last flags were", () => {
  const kinds = [];
  const atlas = { blit: (_c, kind) => kinds.push(kind) };
  const corpse = [{
    name: "P", accountId: "a.p", teamId: 1, isFocal: true, dropTime: null, deathTime: 4,
    positions: [{ t: 0, x: 4000, y: 4000, h: 40, f: 3 }, { t: 10, x: 4000, y: 4000, h: 0, f: 3 }],
  }];
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
    tracks: sampleTracks(buildTracks(corpse), 8),
  });
  expect(kinds).toEqual(["dead"]);
});

// --- review findings, each pinned before the fix -----------------------------

test("a shot line that crosses the view is drawn even though both ends are outside", () => {
  // The old cull said "both ends off-screen means it cannot cross, the viewport
  // is convex". Convexity says a segment between two INSIDE points stays
  // inside; it says nothing about two outside points, and a long-range tracer
  // straight across the map is exactly that case.
  const across = { ax: 0, ay: 4080, vx: 8160, vy: 4080, age: 0 };
  const ctx = recordingCtx();
  paintShots(ctx, { ...frameAt(6), shots: [across], colors: P2_COLORS });
  expect(ctx.calls.filter((c) => c.name === "stroke")).toHaveLength(1);
});

test("a shot line wholly on one side of the view is still culled", () => {
  const ctx = recordingCtx();
  paintShots(ctx, {
    ...frameAt(6),
    shots: [{ ax: 10, ay: 10, vx: 20, vy: 8000, age: 0 }],
    colors: P2_COLORS,
  });
  expect(ctx.calls.filter((c) => c.name === "stroke")).toHaveLength(0);
});

test("landings appear only once the player has actually landed", () => {
  const landings = [{ a: "a.me", t: 60, x: 4000, y: 4000 }];
  const before = recordingCtx();
  paintLandings(before, { ...frameAt(1), landings, t: 30, alpha: 1, colors: P2_COLORS, atlas: null, focalIds: new Set() });
  expect(before.calls.filter((c) => c.name === "stroke")).toHaveLength(0);
  const after = recordingCtx();
  paintLandings(after, { ...frameAt(1), landings, t: 90, alpha: 1, colors: P2_COLORS, atlas: null, focalIds: new Set() });
  expect(after.calls.filter((c) => c.name === "stroke")).toHaveLength(1);
});

test("a landing keeps its team colour through the atlas, not just the fallback", () => {
  const kinds = [];
  const atlas = { blit: (_c, kind) => kinds.push(kind) };
  const landings = [{ a: "a.me", t: 0, x: 4000, y: 4000 }, { a: "a.foe", t: 0, x: 4100, y: 4100 }];
  paintLandings(recordingCtx(), {
    ...frameAt(1), landings, t: 60, alpha: 1, colors: P2_COLORS, atlas,
    focalIds: new Set(["a.me"]),
  });
  expect(kinds).toEqual(["chevronFocal", "chevronEnemy"]);
});

test("a red crate is told apart from an ordinary one through the atlas", () => {
  const kinds = [];
  const atlas = { blit: (_c, kind) => kinds.push(kind) };
  paintPackages(recordingCtx(), {
    ...frameAt(1),
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: false }, { kind: "small", x: 4050, y: 4050, falling: false }],
    colors: P2_COLORS, atlas,
  });
  expect(kinds).toEqual(["crateRed", "crate"]);
});

test("the health arc uses its own three colours, not the team and kill hues", () => {
  const strokes = (h) => {
    const ctx = recordingCtx();
    const p = [{
      name: "P", accountId: "a.p", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4000, y: 4000, h, f: 0 }, { t: 10, x: 4000, y: 4000, h, f: 0 }],
    }];
    drawScene(ctx, { ...frameAt(1), zone: null, colors: P2_COLORS, tracks: sampleTracks(buildTracks(p), 5) });
    return ctx.calls.filter((c) => c.name === "stroke").map((c) => c.strokeStyle ?? null);
  };
  // Health is its own encoding: reusing the focal hue would say "teammate" and
  // reusing the tracer hue would say "kill".
  const ok = strokes(80);
  const warn = strokes(35);
  const danger = strokes(10);
  expect(new Set([...ok, ...warn, ...danger]).size).toBeGreaterThanOrEqual(3);
  expect(ok).not.toContain(P2_COLORS.focal);
  expect(danger).not.toContain(P2_COLORS.tracer);
});

test("the flight dash pattern is a screen-space constant", () => {
  const dashes = (zoom) => {
    const ctx = recordingCtx();
    paintFlight(ctx, { ...frameAt(zoom), segment: { x1: 0, y1: 0, x2: MAP, y2: MAP }, alpha: 1, colors: P2_COLORS });
    return ctx.calls.filter((c) => c.name === "setLineDash").map((c) => c.args[0]);
  };
  expect(dashes(1)[0]).toEqual(SCREEN.flightDash);
  expect(dashes(6)[0]).toEqual(SCREEN.flightDash);
});

// The health arc was the one place P2's "every decision is pinned" thesis
// failed: replayLayers pins the DECISION (fraction, level) but nothing pinned
// the TRANSLATION, so multiplying its radius by the camera scale -- the exact
// P0 regression that turned a 5px dot into 3.1px -- left the suite green.
test("the health arc is screen-sized, like every other marker", () => {
  const hurt = [{
    name: "P", accountId: "a.p", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000, h: 35, f: 0 }, { t: 10, x: 4000, y: 4000, h: 35, f: 0 }],
  }];
  const arcsAt = (zoom) => {
    const ctx = recordingCtx();
    drawScene(ctx, { ...frameAt(zoom), zone: null, colors: P2_COLORS, tracks: sampleTracks(buildTracks(hurt), 5) });
    return ctx.calls.filter((c) => c.name === "arc");
  };
  const a = arcsAt(1);
  const b = arcsAt(6);
  expect(a.length).toBeGreaterThan(1); // the dot plus its arc
  expect(a.map((c) => c.args[2])).toEqual(b.map((c) => c.args[2]));

  // And the arc sits outside the dot at the documented offset and width.
  const arc = a[a.length - 1];
  expect(arc.args[2]).toBe(SCREEN.focalRadius + SCREEN.healthArcRadius);
  expect(arc.lineWidth).toBe(SCREEN.healthArcWidth);
});

test("the health arc sweeps from twelve o'clock in proportion to health", () => {
  const sweepFor = (h) => {
    const p = [{
      name: "P", accountId: "a.p", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4000, y: 4000, h, f: 0 }, { t: 10, x: 4000, y: 4000, h, f: 0 }],
    }];
    const ctx = recordingCtx();
    drawScene(ctx, { ...frameAt(1), zone: null, colors: P2_COLORS, tracks: sampleTracks(buildTracks(p), 5) });
    const arc = ctx.calls.filter((c) => c.name === "arc").pop();
    return { start: arc.args[3], sweep: arc.args[4] - arc.args[3] };
  };
  const quarter = sweepFor(25);
  expect(quarter.start).toBeCloseTo(-Math.PI / 2, 6);
  expect(quarter.sweep).toBeCloseTo(Math.PI / 2, 6);
  expect(sweepFor(50).sweep).toBeCloseTo(Math.PI, 6);
});

// --- final review: shipped data that nothing drew ---------------------------

test("knocks and revives are actually drawn", () => {
  // P1 extracts them, P2 ships and decodes them, and until now nothing put
  // them on the canvas: a whole layer built and invisible.
  const frame = {
    ...frameAt(1), zone: null, colors: P2_COLORS,
    knocks: [{ t: 40, v: "a.foe", vx: 4000, vy: 4000, ax: 4100, ay: 4100 }],
    revives: [{ t: 44, v: "a.foe", x: 4000, y: 4000 }],
    t: 42,
  };
  const withKnock = recordingCtx();
  drawScene(withKnock, frame);
  const without = recordingCtx();
  drawScene(without, { ...frame, knocks: [], revives: [] });
  expect(withKnock.calls.length).toBeGreaterThan(without.calls.length);
});

test("a knock marker expires, so the map does not fill with old ones", () => {
  const knocks = [{ t: 10, v: "a.foe", vx: 4000, vy: 4000, ax: 4100, ay: 4100 }];
  const fresh = recordingCtx();
  drawScene(fresh, { ...frameAt(1), zone: null, colors: P2_COLORS, knocks, t: 11 });
  const stale = recordingCtx();
  drawScene(stale, { ...frameAt(1), zone: null, colors: P2_COLORS, knocks, t: 600 });
  expect(stale.calls.length).toBeLessThan(fresh.calls.length);
});

test("a shot is not painted the same colour as a kill", () => {
  // Both used colors.tracer, so a exchange of fire looked identical to someone
  // dying -- the one distinction a viewer most wants at a glance.
  const shots = recordingCtx();
  paintShots(shots, { ...frameAt(1), shots: [{ ax: 4000, ay: 4000, vx: 4100, vy: 4100, age: 0 }], colors: P2_COLORS });
  const shotColour = shots.calls.filter((c) => c.name === "stroke")[0].strokeStyle;
  const kills = recordingCtx();
  drawScene(kills, {
    ...frameAt(1), zone: null, colors: P2_COLORS,
    flashes: [{ bornMs: 1000, kx: 4000, ky: 4000, vx: 4100, vy: 4100 }], nowMs: 1100,
  });
  const killColour = kills.calls.filter((c) => c.name === "stroke")[0].strokeStyle;
  expect(shotColour).not.toBe(killColour);
});

test("dead markers fade out instead of accumulating for the whole match", () => {
  // By the endgame ~90 of 100 players are dead; drawing every cross forever
  // buries the handful still playing.
  const corpses = Array.from({ length: 12 }, (_, i) => ({
    name: `D${i}`, accountId: `a.${i}`, teamId: i, isFocal: false, dropTime: null, deathTime: 100,
    positions: [{ t: 0, x: 4000 + i * 10, y: 4000 }, { t: 200, x: 4000 + i * 10, y: 4000 }],
  }));
  const tracks = buildTracks(corpses);
  const soon = recordingCtx();
  drawScene(soon, { ...frameAt(1), zone: null, colors: P2_COLORS, t: 110, tracks: sampleTracks(tracks, 110) });
  const later = recordingCtx();
  drawScene(later, { ...frameAt(1), zone: null, colors: P2_COLORS, t: 900, tracks: sampleTracks(tracks, 900) });
  expect(later.calls.length).toBeLessThan(soon.calls.length);
});

// --- state and heading pick the glyph ---------------------------------------

test("a moving player gets a dart aimed along their bearing", () => {
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, angle) => blits.push([kind, angle]) };
  // Two samples 100 m due east apart, so the sampler reports a bearing of 0.
  const runner = [{
    name: "R", accountId: "a.r", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000, h: 100, f: 0 }, { t: 10, x: 4100, y: 4000, h: 100, f: 0 }],
  }];
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
    tracks: sampleTracks(buildTracks(runner), 5),
  });
  expect(blits).toEqual([["movingFocal", 0]]);
});

test("a stationary player gets a disc and no rotation at all", () => {
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, angle) => blits.push([kind, angle]) };
  const idler = [{
    name: "I", accountId: "a.i", teamId: 2, isFocal: false, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000, h: 100, f: 0 }, { t: 10, x: 4000, y: 4000, h: 100, f: 0 }],
  }];
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
    tracks: sampleTracks(buildTracks(idler), 5),
  });
  // undefined, not 0: 0 is due east, and a still marker has no bearing to show.
  expect(blits).toEqual([["enemy", undefined]]);
});

test("each vehicle kind gets its own glyph, and an unknown one rides as a car", () => {
  const kindFor = (f, isFocal) => {
    const blits = [];
    const atlas = { blit: (_c, kind) => blits.push(kind) };
    const rider = [{
      name: "V", accountId: "a.v", teamId: 1, isFocal, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4000, y: 4000, h: 100, f }, { t: 10, x: 4200, y: 4000, h: 100, f }],
    }];
    drawScene(recordingCtx(), {
      ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
      tracks: sampleTracks(buildTracks(rider), 5),
    });
    return blits[0];
  };
  expect(kindFor(1, true)).toBe("vehicleFocal");          // ground
  expect(kindFor(1, false)).toBe("vehicleEnemy");
  expect(kindFor(1 | 4, true)).toBe("planeFocal");        // aircraft
  expect(kindFor(1 | 8, false)).toBe("balloonEnemy");     // rescue balloon
  expect(kindFor(1 | 12, true)).toBe("bikeFocal");        // kind 3, a bike
  // 6 and 7 are unallocated: they ride as a car rather than falling through to
  // a pedestrian, because PUBG ships new vehicle types without warning.
  expect(kindFor(1 | 24, false)).toBe("vehicleEnemy");
  expect(kindFor(1 | 28, true)).toBe("vehicleFocal");
});

test("a vehicle marker is aimed along the bearing too", () => {
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, angle) => blits.push([kind, angle]) };
  const driver = [{
    name: "D", accountId: "a.d", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000, h: 100, f: 1 }, { t: 10, x: 4000, y: 4200, h: 100, f: 1 }],
  }];
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
    tracks: sampleTracks(buildTracks(driver), 5),
  });
  expect(blits[0][0]).toBe("vehicleFocal");
  expect(blits[0][1]).toBeCloseTo(Math.PI / 2, 5); // due south
});

test("knocked and dead outrank movement and vehicle", () => {
  const kindFor = (f, deathTime, at) => {
    const blits = [];
    const atlas = { blit: (_c, kind) => blits.push(kind) };
    const p = [{
      name: "P", accountId: "a.p", teamId: 1, isFocal: true, dropTime: null, deathTime,
      positions: [{ t: 0, x: 4000, y: 4000, h: 30, f }, { t: 10, x: 4300, y: 4000, h: 30, f }],
    }];
    drawScene(recordingCtx(), {
      ...frameAt(1), zone: null, colors: P2_COLORS, atlas, t: at,
      tracks: sampleTracks(buildTracks(p), at),
    });
    return blits[0];
  };
  // Moving fast and in a vehicle, but knocked: the knock is what matters.
  expect(kindFor(1 | 2 | 4, null, 5)).toBe("knockedFocal");
  expect(kindFor(1 | 2 | 4, 3, 5)).toBe("dead");
});

test("a parked vehicle keeps its last bearing instead of always pointing east", () => {
  // The cell's nose is at +x, so drawing a stopped car upright aims every
  // parked vehicle due east. The sampler holds the last real bearing exactly
  // so this case has something honest to use.
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, angle) => blits.push([kind, angle]) };
  const parked = [{
    name: "P", accountId: "a.p", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [
      { t: 0, x: 4000, y: 4000, h: 100, f: 1 },
      { t: 10, x: 4000, y: 4200, h: 100, f: 1 },  // drove south
      { t: 20, x: 4000, y: 4200, h: 100, f: 1 },  // then stopped
    ],
  }];
  const tracks = buildTracks(parked);
  drawScene(recordingCtx(), { ...frameAt(1), zone: null, colors: P2_COLORS, atlas, tracks: sampleTracks(tracks, 15) });
  expect(tracks.outMoving[0]).toBe(0);
  expect(blits[0][0]).toBe("vehicleFocal");
  expect(blits[0][1]).toBeCloseTo(Math.PI / 2, 5);
});

test("a player standing still still gets no bearing", () => {
  // Only vehicles keep a held angle: the still disc has no axis to aim, and
  // rotating it would be meaningless work every frame.
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, angle) => blits.push([kind, angle]) };
  const idler = [{
    name: "I", accountId: "a.i", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
    positions: [
      { t: 0, x: 4000, y: 4000, h: 100, f: 0 },
      { t: 10, x: 4000, y: 4200, h: 100, f: 0 },
      { t: 20, x: 4000, y: 4200, h: 100, f: 0 },
    ],
  }];
  drawScene(recordingCtx(), { ...frameAt(1), zone: null, colors: P2_COLORS, atlas, tracks: sampleTracks(buildTracks(idler), 15) });
  expect(blits).toEqual([["focal", undefined]]);
});

test("the cargo plane is drawn on its corridor while it is over the map", () => {
  const blits = [];
  const atlas = { blit: (_c, kind, x, y, _r, angle) => blits.push({ kind, x, y, angle }) };
  const flight = { x1: 2000, y1: 2000, t1: 20, x2: 6000, y2: 6000, t2: 60, speed: 142 };
  const frame = { ...frameAt(1), zone: null, colors: P2_COLORS, atlas, flight, t: 40 };
  drawScene(recordingCtx(), frame);
  const plane = blits.find((b) => b.kind === "planeFocal" || b.kind === "planeEnemy");
  expect(plane).toBeDefined();
  // Halfway between the two jumps in time is halfway between them in space.
  const mid = worldToScreen(frame.cam, frame.vw, frame.vh, 4000, 4000);
  expect(plane.x).toBeCloseTo(mid.x, 0);
  expect(plane.y).toBeCloseTo(mid.y, 0);
  expect(plane.angle).toBeCloseTo(Math.PI / 4, 4);
});

test("the plane is gone once it has left the map", () => {
  const blits = [];
  const atlas = { blit: (_c, kind) => blits.push(kind) };
  const flight = { x1: 2000, y1: 2000, t1: 20, x2: 6000, y2: 6000, t2: 60, speed: 142 };
  drawScene(recordingCtx(), { ...frameAt(1), zone: null, colors: P2_COLORS, atlas, flight, t: 600 });
  expect(blits.filter((k) => k.startsWith("plane"))).toHaveLength(0);
});

test("the flight layer toggle hides the plane too, not just the corridor", () => {
  const blits = [];
  const atlas = { blit: (_c, kind) => blits.push(kind) };
  const flight = { x1: 2000, y1: 2000, t1: 20, x2: 6000, y2: 6000, t2: 60, speed: 142 };
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas, flight, t: 40,
    layers: { flight: false },
  });
  expect(blits.filter((k) => k.startsWith("plane"))).toHaveLength(0);
});

test("each team gets its own colour, and the focal team keeps its own", () => {
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, _a, ci) => blits.push([kind, ci]) };
  const lobby = [1, 2, 3, 9].map((teamId, i) => ({
    name: `P${i}`, accountId: `a.${i}`, teamId, isFocal: teamId === 1,
    dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000 + i * 20, y: 4000, h: 100, f: 0 },
                { t: 10, x: 4000 + i * 20, y: 4000, h: 100, f: 0 }],
  }));
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
    focalTeamId: 1, tracks: sampleTracks(buildTracks(lobby), 5),
  });
  const byIndex = blits.map(([, ci]) => ci);
  // The focal team is index 0 -- its own colour, never drawn from the palette.
  expect(byIndex[0]).toBe(0);
  // Every other team gets a non-zero index, and no two of these share one.
  const others = byIndex.slice(1);
  expect(others.every((ci) => ci > 0)).toBe(true);
  expect(new Set(others).size).toBe(others.length);
});

test("a player with no team does not borrow the focal colour", () => {
  const blits = [];
  const atlas = { blit: (_c, _k, _x, _y, _r, _a, ci) => blits.push(ci) };
  const stray = [{
    name: "S", accountId: "a.s", teamId: null, isFocal: false, dropTime: null, deathTime: null,
    positions: [{ t: 0, x: 4000, y: 4000, h: 100, f: 0 }, { t: 10, x: 4000, y: 4000, h: 100, f: 0 }],
  }];
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas,
    focalTeamId: 1, tracks: sampleTracks(buildTracks(stray), 5),
  });
  // Index 0 is the enemy colour for a non-focal player, which is the safe
  // answer: an unknown team must not read as "your squad".
  expect(blits).toEqual([0]);
});

test("a player under canopy is drawn as one, whatever else is true of them", () => {
  const kindFor = (over) => {
    const blits = [];
    const atlas = { blit: (_c, kind) => blits.push(kind) };
    const p = [{
      name: "J", accountId: "a.j", teamId: 1, isFocal: true, dropTime: 10, landTime: 50,
      deathTime: null, positions: [
        { t: 0, x: 4000, y: 4000, h: 100, f: 0 }, { t: 60, x: 4300, y: 4000, h: 100, f: 0 },
      ], ...over,
    }];
    drawScene(recordingCtx(), {
      ...frameAt(1), zone: null, colors: P2_COLORS, atlas, t: 30,
      tracks: sampleTracks(buildTracks(p), 30),
    });
    return blits[0];
  };
  // Falling and moving fast, but the canopy is the thing to show.
  expect(kindFor({})).toBe("parachuteFocal");
  expect(kindFor({ isFocal: false })).toBe("parachuteEnemy");
});

test("each vehicle class gets its own shape", () => {
  const kindFor = (f) => {
    const blits = [];
    const atlas = { blit: (_c, kind) => blits.push(kind) };
    const p = [{
      name: "V", accountId: "a.v", teamId: 1, isFocal: true, dropTime: null, landTime: null,
      deathTime: null, positions: [
        { t: 0, x: 4000, y: 4000, h: 100, f }, { t: 10, x: 4200, y: 4000, h: 100, f },
      ],
    }];
    drawScene(recordingCtx(), {
      ...frameAt(1), zone: null, colors: P2_COLORS, atlas, t: 5,
      tracks: sampleTracks(buildTracks(p), 5),
    });
    return blits[0];
  };
  expect(kindFor(1)).toBe("vehicleFocal");          // car, kind 0
  expect(kindFor(1 | (1 << 2))).toBe("planeFocal");
  expect(kindFor(1 | (2 << 2))).toBe("balloonFocal");
  expect(kindFor(1 | (3 << 2))).toBe("bikeFocal");
  expect(kindFor(1 | (4 << 2))).toBe("truckFocal");
  expect(kindFor(1 | (5 << 2))).toBe("boatFocal");
  // Kinds PUBG has not shipped yet ride as a car rather than vanishing.
  expect(kindFor(1 | (6 << 2))).toBe("vehicleFocal");
  expect(kindFor(1 | (7 << 2))).toBe("vehicleFocal");
});

test("the parachute is never turned by the bearing", () => {
  // Every other glyph points +x and is aimed along the direction of travel.
  // A canopy has an up, and a descending player is always "moving", so this is
  // the one marker the normal rule would ruin -- it would hang sideways, and
  // worst of all in the last seconds before touchdown, when the horizontal
  // component of a fall is jitter.
  const blits = [];
  const atlas = { blit: (_c, kind, _x, _y, _r, angle) => blits.push([kind, angle]) };
  const jumper = [{
    name: "J", accountId: "a.j", teamId: 1, isFocal: true, dropTime: 10, landTime: 50,
    deathTime: null, positions: [
      { t: 0, x: 4000, y: 4000, h: 100, f: 0 },
      { t: 60, x: 4000, y: 4600, h: 100, f: 0 },
    ],
  }];
  drawScene(recordingCtx(), {
    ...frameAt(1), zone: null, colors: P2_COLORS, atlas, t: 30,
    tracks: sampleTracks(buildTracks(jumper), 30),
  });
  expect(blits[0][0]).toBe("parachuteFocal");
  expect(blits[0][1]).toBeUndefined();
});

test("care packages use the official artwork when it has loaded", () => {
  // PUBG publishes a falling and a landed crate icon, and they are the one
  // thing in that repo that is genuinely a map marker: 144x200 and 144x136,
  // already the right shape. Drawing them beats anything hand-traced here.
  const drawn = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => drawn.push(args);
  const images = { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 } };
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images,
    packages: [
      { kind: "redbox", x: 4000, y: 4000, falling: true },
      { kind: "small", x: 4100, y: 4100, falling: false },
    ],
  });
  expect(drawn).toHaveLength(2);
  expect(drawn[0][0]).toBe(images.falling);
  expect(drawn[1][0]).toBe(images.landed);
});

test("a crate keeps its aspect ratio rather than being squashed to a square", () => {
  const drawn = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => drawn.push(args);
  const images = { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 } };
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images,
    packages: [{ kind: "small", x: 4000, y: 4000, falling: true }],
  });
  const [, , , w, h] = drawn[0];
  expect(h / w).toBeCloseTo(200 / 144, 3);
});

test("crates still draw before the artwork arrives", () => {
  // The images load asynchronously; until then the drawn glyph stands in, so
  // there is never a frame with no care packages on it.
  const ctx = recordingCtx();
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images: null,
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: false }],
  });
  expect(ctx.calls.filter((c) => c.name === "fill").length).toBeGreaterThan(0);
});

test("a care package is clearly larger than a player marker", () => {
  // It is a landmark people move towards and it stays on the map for the rest
  // of the match, unlike a player who is only ever passing through. Drawn at a
  // player's size it read as just another dot.
  const drawn = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => drawn.push(args);
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null,
    images: { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 } },
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: false }],
  });
  const [, , , w] = drawn[0];
  expect(w).toBeGreaterThan(SCREEN.focalRadius * 2 * 1.2);
});

test("an opened crate is drawn open", () => {
  const drawn = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => drawn.push(args);
  const images = {
    falling: { width: 144, height: 200 },
    landed: { width: 144, height: 136 },
    open: { width: 144, height: 136 },
  };
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images,
    packages: [
      { kind: "redbox", x: 4000, y: 4000, falling: false, fall: 1, looted: true },
      { kind: "redbox", x: 4100, y: 4100, falling: false, fall: 1, looted: false },
    ],
  });
  expect(drawn[0][0]).toBe(images.open);
  expect(drawn[1][0]).toBe(images.landed);
});

const CRATE_ART = { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 }, open: { width: 144, height: 136 } };

test("a crate somebody has emptied is drawn faded", () => {
  const ctx = recordingCtx();
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images: CRATE_ART,
    packages: [
      { kind: "redbox", x: 4000, y: 4000, falling: false, fall: 1, looted: true },
      { kind: "redbox", x: 4100, y: 4100, falling: false, fall: 1, looted: false },
    ],
  });
  const draws = ctx.calls.filter((c) => c.name === "drawImage");
  expect(draws).toHaveLength(2);
  expect(draws[0].globalAlpha).toBe(SCREEN.lootedAlpha);
  // The one nobody has touched keeps its full weight, so the two are told
  // apart by more than which PNG they use.
  expect(draws[1].globalAlpha).toBe(1);
  // Faded, not gone: it still marks where a fight probably happened.
  expect(SCREEN.lootedAlpha).toBeGreaterThan(0.45);
  expect(SCREEN.lootedAlpha).toBeLessThan(0.75);
});

test("the fade does not leak onto the next crate or the rest of the frame", () => {
  const ctx = recordingCtx();
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images: CRATE_ART,
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: false, fall: 1, looted: true }],
  });
  expect(ctx.globalAlpha).toBe(1);
});

test("the stand-in glyph fades too, so the state survives a failed icon fetch", () => {
  const ctx = recordingCtx();
  const blits = [];
  const atlas = { blit: (c, kind) => blits.push({ kind, globalAlpha: c.globalAlpha }) };
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas, images: null,
    packages: [
      { kind: "redbox", x: 4000, y: 4000, falling: false, fall: 1, looted: true },
      { kind: "redbox", x: 4100, y: 4100, falling: false, fall: 1, looted: false },
    ],
  });
  expect(blits[0].globalAlpha).toBe(SCREEN.lootedAlpha);
  expect(blits[1].globalAlpha).toBe(1);
});

test("a crate still under its canopy is not faded, however it ends up", () => {
  // Still in the air means still worth going to. The payload knows it will be
  // looted long before anyone reaches it, and fading it there says the
  // opposite.
  const ctx = recordingCtx();
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images: CRATE_ART,
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: true, fall: 0.5, looted: true }],
  });
  expect(ctx.calls.find((c) => c.name === "drawImage").globalAlpha).toBe(1);
});

test("a falling crate is still falling even after somebody will loot it", () => {
  // looted is about the rest of the match; while it is in the air it is a
  // crate under a canopy, whatever happens later.
  const drawn = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => drawn.push(args);
  const images = { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 }, open: { width: 144, height: 136 } };
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null, images,
    packages: [{ kind: "redbox", x: 4000, y: 4000, falling: true, fall: 0.5, looted: true }],
  });
  expect(drawn[0][0]).toBe(images.falling);
});

// Centre and size of the one crate drawn, recovered from the drawImage call.
// drawImage takes the top-left corner, so the centre is the corner plus half
// the box -- which is what the descent is actually about.
const crateBox = (pkg) => {
  const drawn = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => drawn.push(args);
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null,
    images: { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 }, open: { width: 144, height: 136 } },
    packages: [pkg],
  });
  const [, dx, dy, w, h] = drawn[0];
  return { cx: dx + w / 2, cy: dy + h / 2, w };
};

const fallingCrate = (fall) => crateBox({ kind: "redbox", x: 4000, y: 4000, falling: true, fall, looted: false });

test("a falling crate starts above its landing point and comes down onto it", () => {
  // The drop is straight down, so on a map seen from above the world position
  // never changes. The descent is drawn instead: high over the point at the
  // start of the fall, on it at the end.
  const landedY = crateBox({ kind: "redbox", x: 4000, y: 4000, falling: false, fall: 1, looted: false }).cy;

  expect(fallingCrate(0).cy).toBeLessThan(fallingCrate(0.5).cy);
  expect(fallingCrate(0.5).cy).toBeLessThan(fallingCrate(0.99).cy);
  // It leaves the plane a full fall height up...
  expect(landedY - fallingCrate(0).cy).toBeCloseTo(SCREEN.crateFallHeight, 6);
  // ...and touches down exactly on the point, so the handoff to the landed
  // crate does not jump.
  expect(fallingCrate(1).cy).toBeCloseTo(landedY, 6);
});

test("a crate is the same size the whole way down", () => {
  // Size is the marker's own scale, not a stand-in for altitude -- the descent
  // shows the altitude now.
  const expected = SCREEN.crateRadius * 2 * SCREEN.crateArtScale;
  for (const fall of [0, 0.25, 0.5, 0.99, 1]) {
    expect(fallingCrate(fall).w).toBeCloseTo(expected, 6);
  }
});

test("the swing under the canopy dies out by touchdown", () => {
  // A crate still swinging at the moment it lands would snap sideways onto its
  // point. Sampled across the fall, the widest swing is early and there is
  // none left at the end.
  const landedX = crateBox({ kind: "redbox", x: 4000, y: 4000, falling: false, fall: 1, looted: false }).cx;
  const swingAt = (fall) => Math.abs(fallingCrate(fall).cx - landedX);

  let early = 0;
  let late = 0;
  for (let k = 0; k <= 20; k += 1) {
    const fall = k / 20;
    const swing = swingAt(fall);
    if (fall < 0.4) early = Math.max(early, swing);
    if (fall > 0.8) late = Math.max(late, swing);
  }
  expect(early).toBeGreaterThan(1);
  expect(late).toBeLessThan(early);
  expect(swingAt(1)).toBeCloseTo(0, 6);
});

test("the stand-in glyph descends too, so a slow icon fetch does not freeze the drop", () => {
  // The artwork is fetched over the network; until it arrives -- and forever,
  // if it 404s -- this is the crate. It has to fall like one.
  const arcY = (fall) => {
    const ctx = recordingCtx();
    paintPackages(ctx, {
      ...frameAt(1), colors: P2_COLORS, atlas: null, images: null,
      packages: [{ kind: "redbox", x: 4000, y: 4000, falling: fall < 1, fall, looted: false }],
    });
    return ctx.calls.find((c) => c.name === "arc").args[1];
  };
  expect(arcY(0)).toBeLessThan(arcY(0.5));
  expect(arcY(0.5)).toBeLessThan(arcY(1));
  expect(arcY(1) - arcY(0)).toBeCloseTo(SCREEN.crateFallHeight, 6);
});

test("crates in the air do not sway in unison", () => {
  const xs = [];
  const ctx = recordingCtx();
  ctx.drawImage = (...args) => xs.push(args[1]);
  paintPackages(ctx, {
    ...frameAt(1), colors: P2_COLORS, atlas: null,
    images: { falling: { width: 144, height: 200 }, landed: { width: 144, height: 136 }, open: { width: 144, height: 136 } },
    packages: [
      { kind: "redbox", x: 4000, y: 4000, falling: true, fall: 0.4, looted: false },
      { kind: "redbox", x: 4000, y: 4000, falling: true, fall: 0.4, looted: false },
    ],
  });
  // Same position and the same moment of their descent, but seeded apart, so a
  // cluster of drops does not read as one rigid object.
  expect(xs[0]).not.toBe(xs[1]);
});

// Zoomed out, sixty names over a map is noise and the focal team plus whatever
// is selected is the whole useful set. Zoomed in on a fight there are only a
// handful of markers on screen and the question changes from "who is mine" to
// "who is that" -- so past a threshold every visible player is named.
test("names every visible player once the map is zoomed in close", () => {
  const ctx = recordingCtx();
  drawScene(ctx, frameAt(SCREEN.labelAllZoom));
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toEqual(["Me", "Foe"]);
});

test("names only the focal team and the selection until then", () => {
  const ctx = recordingCtx();
  drawScene(ctx, frameAt(SCREEN.labelAllZoom - 0.01));
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toEqual(["Me"]);
});

test("gives the names that always show the cap before the ones zoom added", () => {
  // The cap exists so a crowded compound cannot bury the map in text. Which
  // names it keeps matters: dropping your own squad to fit a stranger in would
  // be the wrong way round, and track order alone would do exactly that.
  const crowd = [
    { name: "Enemy1", accountId: "a.e1", teamId: 9, isFocal: false, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4050, y: 4050 }, { t: 10, x: 4050, y: 4050 }] },
    ...players,
  ];
  const ctx = recordingCtx();
  drawScene(ctx, {
    ...frameAt(SCREEN.labelAllZoom),
    tracks: sampleTracks(buildTracks(crowd), 5),
    labelCap: 1,
  });
  const texts = ctx.calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);
  expect(texts).toEqual(["Me"]);
});

test("unlocks the extra names two double-clicks in, and no sooner", () => {
  // The tests above read labelAllZoom, so they follow it wherever it goes and
  // a silent move to 1 would mean "always name everyone" without failing
  // anything. The number itself is the judgment, so it is pinned here.
  //
  // Zoom runs 1..16 and a double-click doubles it, so 4 is exactly two of
  // them -- a quarter of the map's width filling the viewport. Lower and a
  // mid-zoom overview fills with text; higher and you have to push in past
  // the fight before it will tell you who you are looking at.
  expect(SCREEN.labelAllZoom).toBe(4);
});

// A traced vehicle is inscribed by its LONG side, so a car 28 units wide and
// 13 tall fills the marker box across and less than half of it down. At the
// plain radius that is ten pixels by under five -- a smudge, not a car. The
// canopy already has this exemption for the same kind of reason; see
// SCREEN.parachuteRadius.
describe("a flat glyph gets a bigger box so it reads at the same weight", () => {
  const blitFor = (flags, isFocal, over = {}) => {
    const out = [];
    const atlas = { blit: (_c, kind, _x, _y, r) => out.push({ kind, r }) };
    const one = [{
      name: "P", accountId: "a.p", teamId: 1, isFocal, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4000, y: 4000, h: 100, f: flags }, { t: 10, x: 4000, y: 4000, h: 100, f: flags }],
    }];
    drawScene(recordingCtx(), {
      ...frameAt(1), atlas, tracks: sampleTracks(buildTracks(one), 5), ...over,
    });
    return out[0];
  };

  it("draws a player in a vehicle larger than the same player on foot", () => {
    const onFoot = blitFor(0, false);
    const driving = blitFor(1, false);
    expect(driving.kind).toBe("vehicleEnemy");
    expect(driving.r).toBeCloseTo(onFoot.r * SCREEN.flatGlyphScale, 6);
    expect(driving.r).toBeGreaterThan(onFoot.r);
  });

  it("keeps the focal and selected sizes above the plain one inside a vehicle", () => {
    // A multiplier rather than a radius of its own: the canopy takes a flat
    // value and loses the friend/foe/selected hierarchy with it, and a car is
    // on the map far longer than a canopy is.
    const enemy = blitFor(1, false).r;
    const focal = blitFor(1, true).r;
    const chosen = blitFor(1, true, { focusedAccountId: "a.p" }).r;
    expect(focal).toBeGreaterThan(enemy);
    expect(chosen).toBeGreaterThan(focal);
  });

  it("gives the bigger box to every ride that is wider than it is tall", () => {
    // Testing the car alone let a mutation drop the bike out of the flat set
    // without failing anything. The vehicle code rides in the flags above the
    // in-vehicle bit: 0 car, 1 plane, 2 balloon, 3 bike, 4 truck, 5 boat.
    const plain = blitFor(0, false).r;
    for (const [code, kind] of [
      [0, "vehicleEnemy"], [1, "planeEnemy"], [3, "bikeEnemy"],
      [4, "truckEnemy"], [5, "boatEnemy"],
    ]) {
      const ride = blitFor(1 | (code << 2), false);
      expect(ride.kind, `code ${code}`).toBe(kind);
      expect(ride.r, kind).toBeCloseTo(plain * SCREEN.flatGlyphScale, 6);
    }
  });

  it("leaves a glyph that fills its box on both axes alone", () => {
    // On foot is a disc and the balloon is a circle: both already use the
    // whole box, and scaling them would just make two markers bigger than
    // every other one on the map.
    expect(blitFor(0, false).r).toBe(SCREEN.dotRadius);
    expect(blitFor(0, true).r).toBe(SCREEN.focalRadius);
    const balloon = blitFor(1 | (2 << 2), false);
    expect(balloon.kind).toBe("balloonEnemy");
    expect(balloon.r).toBe(SCREEN.dotRadius);
  });

  it("is a nudge, not a redesign", () => {
    // Pinned because the number is the judgment. At 1.5 an enemy car is 15px
    // across and 7 down, against 10 by 4.7 before -- readable without
    // outweighing the players it is carrying.
    expect(SCREEN.flatGlyphScale).toBe(1.5);
  });
});

// Floating combat text: what came off a player's health, and what they took
// off someone else's. Every source counts -- the zone and a car as much as a
// bullet -- which is what the damage layer is for.
describe("damage numbers", () => {
  const numbersIn = (ctx) => ctx.calls
    .filter((c) => c.name === "fillText" && /^-?\d+$/.test(c.args[0]))
    .map((c) => ({ text: c.args[0], x: c.args[1], y: c.args[2], fill: c.fillStyle, alpha: c.globalAlpha }));

  // frameAt carries no playhead -- the tracks are pre-sampled at 5 and every
  // other layer in these fixtures reads them rather than the clock. This one
  // is a function of the playhead, so it needs one.
  const draw = (damage, over = {}) => {
    const ctx = recordingCtx();
    drawScene(ctx, { ...frameAt(1), t: 5, damage, ...over });
    return numbersIn(ctx);
  };

  it("puts a red minus on whoever lost the health", () => {
    // Me is index 0 and Foe is index 1 in the players fixture.
    const [n] = draw([{ t: 5, a: -1, v: 1, d: 19 }]);
    expect(n.text).toBe("-19");
    expect(n.fill).toBe(COLORS.danger);
  });

  it("says nothing on the player who dealt it", () => {
    // The tracer already runs from the shooter to whoever they hit. A number
    // on both ends states the same hit twice and doubles the text in a fight.
    const shown = draw([{ t: 5, a: 0, v: 1, d: 19 }]);
    expect(shown.map((n) => [n.text, n.fill])).toEqual([["-19", COLORS.danger]]);
  });

  it("counts damage nobody dealt, from the zone or a fall", () => {
    const shown = draw([{ t: 5, a: -1, v: 0, d: 4 }]);
    expect(shown.map((n) => n.text)).toEqual(["-4"]);
  });

  it("floats the number up and fades it as it ages", () => {
    const fresh = draw([{ t: 5, a: -1, v: 1, d: 19 }])[0];
    const old = draw([{ t: 4.2, a: -1, v: 1, d: 19 }])[0];
    expect(old.y).toBeLessThan(fresh.y);
    expect(old.alpha).toBeLessThan(fresh.alpha);
    expect(fresh.alpha).toBeCloseTo(1, 6);
  });

  it("stacks a burst so the numbers do not print on one another", () => {
    // Both at the SAME instant, so they have the same age and the rise cannot
    // be what separates them. With two different times the test passed even
    // with the stacking removed.
    const shown = draw([
      { t: 5, a: -1, v: 1, d: 5 },
      { t: 5, a: -1, v: 1, d: 6 },
    ]);
    expect(shown).toHaveLength(2);
    expect(Math.abs(shown[0].y - shown[1].y)).toBeCloseTo(SCREEN.damageStack, 6);
  });

  it("gives two players trading blows one number each", () => {
    const shown = draw([
      { t: 5, a: 1, v: 0, d: 10 },
      { t: 5, a: 0, v: 1, d: 20 },
    ]);
    // One apiece. Their heights are not comparable -- the two markers stand in
    // different places on the map -- and whether either is stacked is a
    // question for damageAt, which pins it.
    expect(shown.map((n) => n.text).sort()).toEqual(["-10", "-20"]);
  });

  it("says nothing for an index no player has", () => {
    // A payload whose damage layer outran its roster. There is no marker to
    // read a position from at all.
    expect(draw([{ t: 5, a: -1, v: 2, d: 19 }])).toEqual([]);
    expect(draw([{ t: 5, a: -1, v: -1, d: 19 }])).toEqual([]);
  });

  it("says nothing for a player who has not dropped in yet", () => {
    // Tracked, but absent from the map at this instant: their marker is not
    // drawn, so a number over it would float in empty space. This is a
    // different guard from the index check above, and testing only that one
    // left this one unpinned.
    const later = [...players, {
      name: "Late", accountId: "a.late", teamId: 9, isFocal: false, dropTime: 40, deathTime: null,
      positions: [{ t: 40, x: 4000, y: 4000 }, { t: 50, x: 4000, y: 4000 }],
    }];
    const ctx = recordingCtx();
    drawScene(ctx, {
      ...frameAt(1), t: 5, tracks: sampleTracks(buildTracks(later), 5),
      damage: [{ t: 5, a: -1, v: 2, d: 19 }],
    });
    expect(numbersIn(ctx)).toEqual([]);
  });

  it("draws none of it when the layer is switched off", () => {
    expect(draw([{ t: 5, a: 0, v: 1, d: 19 }], { layers: { damage: false } })).toEqual([]);
  });

  it("leaves the canvas at full opacity for whatever draws next", () => {
    const ctx = recordingCtx();
    drawScene(ctx, { ...frameAt(1), t: 5, damage: [{ t: 5, a: 0, v: 1, d: 19 }] });
    expect(ctx.globalAlpha).toBe(1);
  });

  it("survives a payload with no damage layer at all", () => {
    for (const bad of [undefined, null, "x", []]) {
      expect(draw(bad)).toEqual([]);
    }
  });
});
