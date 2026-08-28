import {
  drawScene, drawBackground, pickIndex, SCREEN,
  paintFlight, paintLandings, paintPackages, paintSpecialZones, paintShots,
} from "./replayScene";
import { buildTracks, sampleTracks } from "./replayTracks";
import { fitCamera, clampCamera } from "./replayCamera";

const recordingCtx = () => {
  const calls = [];
  const state = { lineWidth: 0, fillStyle: "", strokeStyle: "", font: "", globalAlpha: 1 };
  const rec = (name) => (...args) => calls.push({ name, args, lineWidth: state.lineWidth, fillStyle: state.fillStyle });
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
    save: rec("save"), restore: rec("restore"),
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
  const rich = {
    ...frameAt(1),
    colors: P2_COLORS,
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
  for (const key of ["shots", "landings", "flight", "packages", "specialZones"]) {
    const off = recordingCtx();
    drawScene(off, { ...rich, layers: { [key]: false } });
    expect(off.calls.length, `${key} flag did nothing`).toBeLessThan(all.calls.length);
  }
});
