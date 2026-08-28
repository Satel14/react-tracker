import { buildAtlas, ICON_PATHS } from "./replaySprites";

const COLORS = {
  focal: "rgb(1,1,1)",
  enemy: "rgb(2,2,2)",
  dead: "rgb(3,3,3)",
  crate: "rgb(4,4,4)",
  flight: "rgb(5,5,5)",
  danger: "rgb(6,6,6)",
};

const CELL = 32;
const MARGIN = 2;
const BOX_MIN = MARGIN;
const BOX_MAX = CELL - MARGIN;

// Endpoint-to-center arc parameterization (SVG spec, x-axis-rotation always 0
// in these paths), sampled finely so a circular arc's true extent -- not just
// its listed endpoints -- lands in the bounding box.
const extendArc = (x1, y1, rx, ry, largeArc, sweep, x2, y2, extend) => {
  const x1p = (x1 - x2) / 2;
  const y1p = (y1 - y2) / 2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const num = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(den === 0 ? 0 : num / den);
  const cxp = (co * rx * y1p) / ry;
  const cyp = (co * -ry * x1p) / rx;
  const cx = cxp + (x1 + x2) / 2;
  const cy = cyp + (y1 + y2) / 2;
  const angleBetween = (ux, uy, vx, vy) => {
    const sgn = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))));
    return sgn * Math.acos(dot);
  };
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const steps = 64;
  for (let i = 0; i <= steps; i += 1) {
    const theta = theta1 + (dTheta * i) / steps;
    extend(cx + rx * Math.cos(theta), cy + ry * Math.sin(theta));
  }
};

// Reads the M/L/A/Z vocabulary ICON_PATHS uses and returns its bounding box.
const pathBBox = (d) => {
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+/g) || [];
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x, y) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M" || cmd === "L") {
      cx = next();
      cy = next();
      extend(cx, cy);
    } else if (cmd === "A") {
      const rx = next();
      const ry = next();
      next(); // x-axis-rotation, always 0 here
      const largeArc = next();
      const sweep = next();
      const x2 = next();
      const y2 = next();
      extendArc(cx, cy, rx, ry, largeArc, sweep, x2, y2, extend);
      cx = x2;
      cy = y2;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

// jsdom has neither Path2D nor a 2D context, so with the real globals the
// atlas branch is unreachable and only the caller's arc fallback ever runs.
// That blind spot is how a glyph that under-filled its cell once shipped.
// These fakes record exactly what buildAtlas rasterises, and where.
const installAtlasEnv = () => {
  const draws = [];
  const ctx = {
    tx: 0,
    sc: 0,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 0,
    save() {},
    restore() {},
    translate(x) { this.tx = x; },
    scale(x) { this.sc = x; },
    fill(path) {
      draws.push({ op: "fill", d: path.d, tx: this.tx, scale: this.sc, colour: this.fillStyle });
    },
    stroke(path) {
      draws.push({ op: "stroke", d: path.d, tx: this.tx, scale: this.sc, colour: this.strokeStyle });
    },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  class FakePath2D {
    constructor(d) { this.d = d; }
  }
  vi.stubGlobal("Path2D", FakePath2D);
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, draws };
};

// Every state that ships a per-team pair, derived rather than listed so a
// third state cannot be added without inheriting these guarantees.
const STATE_PAIRS = Object.keys(ICON_PATHS)
  .filter((k) => k.endsWith("Focal"))
  .map((k) => [k, `${k.slice(0, -"Focal".length)}Enemy`]);

// The source/destination rectangle blit actually samples for one kind.
const blitRect = (atlas, kind, r = 5) => {
  const calls = [];
  atlas.blit({ drawImage: (...args) => calls.push(args) }, kind, 100, 200, r);
  expect(calls, kind).toHaveLength(1);
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = calls[0];
  return { sx, sy, sw, sh, dx, dy, dw, dh };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("exposes a path string per icon kind", () => {
  expect(Object.keys(ICON_PATHS).sort()).toEqual([
    "chevronEnemy", "chevronFocal", "crate", "crateRed", "dead", "enemy", "focal",
    "knockedEnemy", "knockedFocal", "vehicleEnemy", "vehicleFocal",
  ]);
  for (const d of Object.values(ICON_PATHS)) expect(typeof d).toBe("string");
});

test("every icon glyph is inscribed in the same centred 28-unit box", () => {
  // blit maps the whole 32-unit cell onto a 2r destination, uniformly on both
  // axes, so a glyph's on-screen size is set entirely by how much of the cell
  // it occupies. A 2-unit margin keeps antialiasing off the cell edge.
  for (const [kind, d] of Object.entries(ICON_PATHS)) {
    const box = pathBBox(d);
    expect(box.minX, kind).toBeGreaterThanOrEqual(BOX_MIN);
    expect(box.minY, kind).toBeGreaterThanOrEqual(BOX_MIN);
    expect(box.maxX, kind).toBeLessThanOrEqual(BOX_MAX);
    expect(box.maxY, kind).toBeLessThanOrEqual(BOX_MAX);
    expect(box.width, kind).toBeCloseTo(BOX_MAX - BOX_MIN, 5);
    expect(box.height, kind).toBeCloseTo(BOX_MAX - BOX_MIN, 5);
  }
});

test("returns null when the environment has no Path2D, so callers never blit unsafely", () => {
  // jsdom defines document but not Path2D, so the null proves the Path2D
  // guard specifically -- not an incidentally missing document.
  expect(typeof document).not.toBe("undefined");
  expect(typeof Path2D).toBe("undefined");
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  expect(atlas).toBeNull();
});

test("returns null when there is no document", () => {
  class FakePath2D {
    constructor(d) { this.d = d; }
  }
  vi.stubGlobal("Path2D", FakePath2D);
  vi.stubGlobal("document", undefined);
  expect(buildAtlas({ dpr: 2, colors: COLORS })).toBeNull();
});

test("rasterises every kind into its own cell of one sheet", () => {
  const { canvas, draws } = installAtlasEnv();
  const dpr = 2;
  const size = CELL * dpr;
  const kinds = Object.keys(ICON_PATHS);
  const atlas = buildAtlas({ dpr, colors: COLORS });

  expect(atlas).not.toBeNull();
  expect(canvas.width).toBe(size * kinds.length);
  expect(canvas.height).toBe(size);
  // Each glyph drawn exactly once, in declaration order, scaled so its
  // 32-unit design box covers the whole rasterised cell.
  expect(draws.map((d) => d.d)).toEqual(kinds.map((k) => ICON_PATHS[k]));
  draws.forEach((d, i) => {
    expect(d.scale, kinds[i]).toBe(size / CELL);
    expect(d.tx, kinds[i]).toBe(i * size);
  });
});

test("every kind in ICON_PATHS has its own cell and the cells do not overlap", () => {
  const { canvas, draws } = installAtlasEnv();
  const dpr = 2;
  const size = CELL * dpr;
  const kinds = Object.keys(ICON_PATHS);
  const atlas = buildAtlas({ dpr, colors: COLORS });

  const rects = kinds.map((kind) => blitRect(atlas, kind));
  rects.forEach((rect, i) => {
    // The cell blit samples is the cell that glyph was painted into.
    expect(rect.sx, kinds[i]).toBe(draws[i].tx);
    expect(rect.sy, kinds[i]).toBe(0);
    expect(rect.sw, kinds[i]).toBe(size);
    expect(rect.sh, kinds[i]).toBe(size);
    expect(rect.sx + rect.sw, kinds[i]).toBeLessThanOrEqual(canvas.width);
  });

  const ordered = [...rects].sort((a, b) => a.sx - b.sx);
  for (let i = 1; i < ordered.length; i += 1) {
    expect(ordered[i - 1].sx + ordered[i - 1].sw).toBeLessThanOrEqual(ordered[i].sx);
  }
  expect(new Set(rects.map((r) => r.sx)).size).toBe(kinds.length);
});

test("blits the whole cell onto the 2r destination box", () => {
  installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  const rect = blitRect(atlas, "focal", 5);
  expect(rect.dx).toBe(95);
  expect(rect.dy).toBe(195);
  expect(rect.dw).toBe(10);
  expect(rect.dh).toBe(10);
});

test("an unknown kind falls back to the enemy cell", () => {
  installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  expect(blitRect(atlas, "no-such-kind")).toEqual(blitRect(atlas, "enemy"));
});

test("paints every glyph from the palette it was handed", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: COLORS });
  const kinds = Object.keys(ICON_PATHS);
  const paint = Object.fromEntries(draws.map((d, i) => [kinds[i], d]));

  expect(paint.focal.colour).toBe(COLORS.focal);
  expect(paint.enemy.colour).toBe(COLORS.enemy);
  expect(paint.dead.colour).toBe(COLORS.dead);
  // A knocked player is still the same player, and a player in a vehicle is
  // still that player: the state glyphs take the team colour, not one of
  // their own.
  expect(paint.knockedFocal.colour).toBe(COLORS.focal);
  expect(paint.knockedEnemy.colour).toBe(COLORS.enemy);
  expect(paint.vehicleFocal.colour).toBe(COLORS.focal);
  expect(paint.vehicleEnemy.colour).toBe(COLORS.enemy);
  expect(paint.crate.colour).toBe(COLORS.crate);
  // A landing chevron carries the same friend/foe read as the dot it belongs
  // to, so it follows the *Focal/*Enemy promise rather than the flight colour.
  expect(paint.chevronFocal.colour).toBe(COLORS.focal);
  expect(paint.chevronEnemy.colour).toBe(COLORS.enemy);
  // The red crate is the one worth crossing the map for.
  expect(paint.crateRed.colour).toBe(COLORS.danger);

  expect(paint.dead.op).toBe("stroke");
  expect(paint.crate.op).toBe("stroke");
  expect(paint.crateRed.op).toBe("stroke");
  expect(paint.chevronFocal.op).toBe("stroke");
  expect(paint.chevronEnemy.op).toBe("stroke");
  // Paint op is per glyph, not per naming pattern: the state pairs are solid
  // marks while a chevron is a stroked tick. Asserted individually above, and
  // the pair loop keeps its real job -- the colour promise.
  for (const kind of ["knockedFocal", "knockedEnemy", "vehicleFocal", "vehicleEnemy"]) {
    expect(paint[kind].op, kind).toBe("fill");
  }
});

// Regression guard. The atlas bakes each cell's colour in at raster time, so
// a state drawn from ONE cell has to pick a side: a knocked teammate would
// have blitted in the enemy colour, and an enemy who mounted up in the focal
// colour -- friend and foe swapping over precisely when a player changes
// state, which is worse than not drawing the state at all. Team variants are
// the fix, and this is what stops them collapsing back into one cell.
test("the focal and enemy variants of a state paint different palette entries", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: COLORS });
  const kinds = Object.keys(ICON_PATHS);
  const paint = Object.fromEntries(draws.map((d, i) => [kinds[i], d]));

  expect(STATE_PAIRS.length).toBeGreaterThan(0);
  for (const [focalKind, enemyKind] of STATE_PAIRS) {
    // Same shape, so the inscription is shared and only the colour differs.
    expect(ICON_PATHS[enemyKind], enemyKind).toBe(ICON_PATHS[focalKind]);
    expect(paint[focalKind].colour, focalKind).toBe(COLORS.focal);
    expect(paint[enemyKind].colour, enemyKind).toBe(COLORS.enemy);
    expect(paint[focalKind].colour, focalKind).not.toBe(paint[enemyKind].colour);
  }
  // And no team-less spelling survives for a caller to reach for by accident.
  for (const [focalKind] of STATE_PAIRS) {
    expect(ICON_PATHS).not.toHaveProperty(focalKind.replace(/Focal$/, ""));
  }
});

test("falls back to a built-in colour when the palette is empty", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: {} });
  expect(draws).toHaveLength(Object.keys(ICON_PATHS).length);
  for (const d of draws) expect(typeof d.colour).toBe("string");
});
