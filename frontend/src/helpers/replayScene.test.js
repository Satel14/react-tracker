import { drawScene, drawBackground, pickIndex } from "./replayScene";
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
  // split between "marker-sized" and "zone-sized" radii is needed.
  const a = recordingCtx(); drawScene(a, { ...frameAt(1), zone: null });
  const b = recordingCtx(); drawScene(b, { ...frameAt(6), zone: null });
  const radii = (ctx) => arcsOf(ctx).map((c) => c.args[2]).sort((x, y) => x - y);
  expect(radii(a)).toEqual(radii(b));
  const widths = (ctx) => ctx.calls.filter((c) => c.name === "stroke").map((c) => c.lineWidth);
  expect(widths(a)).toEqual(widths(b));
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
