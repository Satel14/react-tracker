import { buildAtlas, vehicleGlyph, ICON_PATHS } from "./replaySprites";

const COLORS = {
  focal: "rgb(1,1,1)",
  enemy: "rgb(2,2,2)",
  dead: "rgb(3,3,3)",
  crate: "rgb(4,4,4)",
  flight: "rgb(5,5,5)",
  danger: "rgb(6,6,6)",
  outline: "rgb(7,7,7)",
};

const CELL = 32;
const MARGIN = 2;
const BOX_MIN = MARGIN;
const BOX_MAX = CELL - MARGIN;

// The padded cell the atlas actually rasterises: the 32-unit design box plus
// PAD units of halo room on every side. Held here as literals rather than
// imported, so a change to either constant has to be re-argued here.
const PAD = 5;
const CELL_BOX = CELL + PAD * 2;
const HALO = 3;

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

// Walks the M/L/A/Z vocabulary ICON_PATHS uses and returns one point list per
// subpath, arcs sampled so their true extent -- not just their listed
// endpoints -- is represented.
const pathPoints = (d) => {
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+/g) || [];
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  let cx = 0;
  let cy = 0;
  const subpaths = [];
  let current = [];
  const push = (x, y) => current.push([x, y]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      current = [];
      subpaths.push(current);
      cx = next();
      cy = next();
      push(cx, cy);
    } else if (cmd === "L") {
      cx = next();
      cy = next();
      push(cx, cy);
    } else if (cmd === "A") {
      const rx = next();
      const ry = next();
      next(); // x-axis-rotation, always 0 here
      const largeArc = next();
      const sweep = next();
      const x2 = next();
      const y2 = next();
      extendArc(cx, cy, rx, ry, largeArc, sweep, x2, y2, push);
      cx = x2;
      cy = y2;
    }
  }
  return subpaths;
};

const pathBBox = (d) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sub of pathPoints(d)) {
    for (const [x, y] of sub) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

// Signed area per subpath. Only the SIGN is read: it is the direction the
// subpath is wound, which under a nonzero fill decides whether two overlapping
// subpaths union or punch each other out. Nothing about the bounding box
// changes when a winding flips, so this is the only thing that can see it.
const subpathAreas = (d) => pathPoints(d).map((pts) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum;
});

// jsdom has neither Path2D nor a 2D context, so with the real globals the
// atlas branch is unreachable and only the caller's arc fallback ever runs.
// That blind spot is how a glyph that under-filled its cell once shipped.
// These fakes record exactly what buildAtlas rasterises, and where. lineWidth
// and the join/cap are recorded too: with a halo pass the ink no longer stops
// at the path, and half a line width is exactly how far past it goes.
// `path2d: false` leaves the real (absent) global alone while still giving
// buildAtlas a canvas that WOULD work, and `context: null` is the jsdom canvas
// that hands back no 2D context. Each isolates one of the two early returns:
// with both stubbed together, either guard alone produces the null and neither
// is actually proven.
const installAtlasEnv = ({ path2d = true, context = true } = {}) => {
  const draws = [];
  const ctx = {
    tx: 0,
    ty: 0,
    sc: 0,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 0,
    lineJoin: null,
    lineCap: null,
    save() {},
    restore() {},
    translate(x, y) { this.tx = x; this.ty = y; },
    scale(x) { this.sc = x; },
    record(op, path, colour) {
      draws.push({
        op,
        d: path.d,
        tx: this.tx,
        ty: this.ty,
        scale: this.sc,
        colour,
        lineWidth: this.lineWidth,
        lineJoin: this.lineJoin,
        lineCap: this.lineCap,
      });
    },
    fill(path) { this.record("fill", path, this.fillStyle); },
    stroke(path) { this.record("stroke", path, this.strokeStyle); },
  };
  const canvas = { width: 0, height: 0, getContext: () => (context ? ctx : null) };
  class FakePath2D {
    constructor(d) { this.d = d; }
  }
  if (path2d) vi.stubGlobal("Path2D", FakePath2D);
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, draws };
};

const KINDS = Object.keys(ICON_PATHS);

// Every kind is painted twice, halo then colour, in declaration order.
const passesByKind = (draws) => {
  expect(draws).toHaveLength(KINDS.length * 2);
  return Object.fromEntries(
    KINDS.map((kind, i) => [kind, { halo: draws[i * 2], colour: draws[i * 2 + 1] }]),
  );
};

// Every state that ships a per-team pair, derived rather than listed so a
// third state cannot be added without inheriting these guarantees.
const STATE_PAIRS = Object.keys(ICON_PATHS)
  .filter((k) => k.endsWith("Focal"))
  .map((k) => [k, `${k.slice(0, -"Focal".length)}Enemy`]);

// Records the whole call sequence, not just drawImage: a rotated blit has to
// leave the target's transform as it found it, which only the order shows.
const fakeTarget = () => {
  const ops = [];
  return {
    ops,
    save() { ops.push({ op: "save" }); },
    restore() { ops.push({ op: "restore" }); },
    translate(x, y) { ops.push({ op: "translate", x, y }); },
    rotate(a) { ops.push({ op: "rotate", a }); },
    drawImage(...args) { ops.push({ op: "drawImage", args }); },
  };
};

// The source/destination rectangle blit actually samples for one kind.
const blitRect = (atlas, kind, r = 5, angle) => {
  const target = fakeTarget();
  atlas.blit(target, kind, 100, 200, r, angle);
  const drawn = target.ops.filter((o) => o.op === "drawImage");
  expect(drawn, kind).toHaveLength(1);
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = drawn[0].args;
  return { sx, sy, sw, sh, dx, dy, dw, dh, ops: target.ops };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("exposes a path string per icon kind", () => {
  expect(Object.keys(ICON_PATHS).sort()).toEqual([
    "balloonEnemy", "balloonFocal", "chevronEnemy", "chevronFocal", "crate", "crateRed",
    "dead", "enemy", "focal", "knockedEnemy", "knockedFocal", "movingEnemy", "movingFocal",
    "planeEnemy", "planeFocal", "vehicleEnemy", "vehicleFocal",
  ]);
  for (const d of Object.values(ICON_PATHS)) expect(typeof d).toBe("string");
});

test("every icon glyph is inscribed in the same centred 28-unit box", () => {
  // blit maps the 32-unit design box onto a 2r destination, uniformly on both
  // axes, so a glyph's on-screen size is set entirely by how much of that box
  // it occupies. A 2-unit margin keeps antialiasing off the box edge.
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

// The inscription rule above bounds the PATH; the halo is ink the path does
// not account for. Round joins and caps put it exactly half a line width past
// the path, so this is the real "nothing gets clipped" guard now, and it is
// what sizes PAD. Shrink PAD, widen HALO, or let a mitre join back in and this
// fails rather than shipping a glyph with a shaved edge.
test("no pass paints outside its padded cell, and the 2-unit antialias margin survives", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 2, colors: COLORS });
  const passes = passesByKind(draws);

  for (const [kind, { halo, colour }] of Object.entries(passes)) {
    const box = pathBBox(ICON_PATHS[kind]);
    for (const pass of [halo, colour]) {
      // A fill puts ink on the path exactly; a stroke puts it half a line
      // width either side, and only a round join/cap holds it to that.
      const reach = pass.op === "stroke" ? pass.lineWidth / 2 : 0;
      if (pass.op === "stroke") {
        expect(pass.lineJoin, kind).toBe("round");
        expect(pass.lineCap, kind).toBe("round");
      }
      expect(box.minX - reach, kind).toBeGreaterThanOrEqual(-PAD + MARGIN);
      expect(box.minY - reach, kind).toBeGreaterThanOrEqual(-PAD + MARGIN);
      expect(box.maxX + reach, kind).toBeLessThanOrEqual(CELL + PAD - MARGIN);
      expect(box.maxY + reach, kind).toBeLessThanOrEqual(CELL + PAD - MARGIN);
    }
    // And the halo really is HALO units wider than the mark it protects on
    // each side -- a halo no wider than the fill is invisible.
    const covered = colour.op === "stroke" ? colour.lineWidth : 0;
    expect(halo.lineWidth - covered, kind).toBe(HALO * 2);
  }
});

// The knocked ring's hole is punched by winding, not carved by a second
// shape: its inner circle runs sweep 1 against the outer's sweep 0 so the
// nonzero fill takes it out. Flip that and the ring fills solid -- a downed
// player becomes indistinguishable from a standing one, with no change to the
// bounding box, so the inscription test above cannot see it. The multi-part
// vehicles have the opposite requirement: their subpaths overlap on purpose
// and must all be wound the same way, or an axle punches a hole in the hull
// instead of joining it.
test("only the knocked ring is wound to punch a hole; every other fill unions", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: COLORS });

  const holed = [];
  for (const [kind, { colour }] of Object.entries(passesByKind(draws))) {
    // A stroked glyph has no interior, so winding says nothing about it.
    if (colour.op !== "fill") continue;
    const areas = subpathAreas(ICON_PATHS[kind]).filter((a) => Math.abs(a) > 1e-6);
    expect(areas.length, kind).toBeGreaterThan(0);
    if (new Set(areas.map((a) => Math.sign(a))).size > 1) holed.push(kind);
  }
  expect(holed.sort()).toEqual(["knockedEnemy", "knockedFocal"]);

  const ring = subpathAreas(ICON_PATHS.knockedFocal);
  expect(ring).toHaveLength(2);
  expect(Math.sign(ring[0])).toBe(-Math.sign(ring[1]));
  // The hole is the smaller of the two, not the other way round.
  expect(Math.abs(ring[0])).toBeGreaterThan(Math.abs(ring[1]));
});

test("returns null when the environment has no Path2D, so callers never blit unsafely", () => {
  // jsdom defines document but not Path2D. Handing it a canvas that DOES
  // return a context is what makes this prove the Path2D guard: against the
  // real jsdom canvas, getContext returns null too, so dropping the Path2D
  // check entirely still produced a null and this test passed on the wrong
  // guard. Nothing rasterised is the other half of the proof.
  expect(typeof document).not.toBe("undefined");
  expect(typeof Path2D).toBe("undefined");
  const { draws } = installAtlasEnv({ path2d: false });
  expect(buildAtlas({ dpr: 2, colors: COLORS })).toBeNull();
  expect(draws).toHaveLength(0);
});

test("returns null when the canvas hands back no 2D context", () => {
  // The other early return, and the one jsdom actually hits: a caller there
  // needs the null to reach its arc fallback.
  const { draws } = installAtlasEnv({ context: null });
  expect(buildAtlas({ dpr: 2, colors: COLORS })).toBeNull();
  expect(draws).toHaveLength(0);
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
  const size = CELL_BOX * dpr;
  const atlas = buildAtlas({ dpr, colors: COLORS });

  expect(atlas).not.toBeNull();
  expect(size).toBe(84);
  expect(canvas.width).toBe(size * KINDS.length);
  expect(canvas.height).toBe(size);
  // One sheet, one row, so every kind added widens it. A browser canvas caps
  // out well above this, but not infinitely far above it.
  expect(canvas.width).toBe(1428);
  expect(canvas.width).toBeLessThan(4096);

  // Each glyph drawn twice, in declaration order, scaled so its PADDED box --
  // not its 32-unit design box -- covers the rasterised cell, and shifted by
  // PAD so it sits in the middle of it.
  expect(draws.map((d) => d.d)).toEqual(KINDS.flatMap((k) => [ICON_PATHS[k], ICON_PATHS[k]]));
  draws.forEach((d, i) => {
    const kind = KINDS[Math.floor(i / 2)];
    expect(d.scale, kind).toBe(size / CELL_BOX);
    expect(d.tx, kind).toBe(Math.floor(i / 2) * size + PAD * (size / CELL_BOX));
    expect(d.ty, kind).toBe(PAD * (size / CELL_BOX));
  });
  expect(draws[0].tx).toBe(10);
  expect(draws[0].ty).toBe(10);
});

// The defect this whole pass exists to fix: a flat fill in one colour vanishes
// into pale sand on Miramar or white snow on Vikendi. The halo has to go down
// FIRST -- painted after, it would cover the glyph it is meant to separate.
test("paints a dark halo under every glyph, before the colour", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: COLORS });
  const passes = passesByKind(draws);

  // passesByKind takes the FIRST of each kind's two draws as the halo purely
  // by position, so asserting that one is the outline colour is what pins the
  // order: paint the colour first and these land the other way round.
  for (const [kind, { halo, colour }] of Object.entries(passes)) {
    expect(halo.op, kind).toBe("stroke");
    expect(halo.colour, kind).toBe(COLORS.outline);
    expect(colour.colour, kind).not.toBe(COLORS.outline);
    // Same path, so the halo traces the silhouette rather than approximating it.
    expect(halo.d, kind).toBe(ICON_PATHS[kind]);
    expect(halo.lineWidth, kind).toBeGreaterThan(colour.op === "stroke" ? colour.lineWidth : 0);
  }
});

test("falls back to a built-in halo colour when the palette has no outline", () => {
  const { draws } = installAtlasEnv();
  const { outline, ...noOutline } = COLORS;
  buildAtlas({ dpr: 1, colors: noOutline });
  const passes = passesByKind(draws);
  for (const [kind, { halo, colour }] of Object.entries(passes)) {
    expect(typeof halo.colour, kind).toBe("string");
    expect(halo.colour, kind).not.toBe(outline);
    // Still a halo and not a second coat of the glyph's own colour.
    expect(halo.colour, kind).not.toBe(colour.colour);
  }
});

test("every kind in ICON_PATHS has its own cell and the cells do not overlap", () => {
  const { canvas, draws } = installAtlasEnv();
  const dpr = 2;
  const size = CELL_BOX * dpr;
  const atlas = buildAtlas({ dpr, colors: COLORS });

  const rects = KINDS.map((kind) => blitRect(atlas, kind));
  rects.forEach((rect, i) => {
    // The cell blit samples is the cell that glyph was painted into.
    expect(rect.sx, KINDS[i]).toBe(draws[i * 2].tx - PAD * (size / CELL_BOX));
    expect(rect.sy, KINDS[i]).toBe(0);
    expect(rect.sw, KINDS[i]).toBe(size);
    expect(rect.sh, KINDS[i]).toBe(size);
    expect(rect.sx + rect.sw, KINDS[i]).toBeLessThanOrEqual(canvas.width);
  });

  const ordered = [...rects].sort((a, b) => a.sx - b.sx);
  for (let i = 1; i < ordered.length; i += 1) {
    expect(ordered[i - 1].sx + ordered[i - 1].sw).toBeLessThanOrEqual(ordered[i].sx);
  }
  expect(new Set(rects.map((r) => r.sx)).size).toBe(KINDS.length);
});

test("blits the padded cell so the design box still lands on the 2r destination", () => {
  installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  const rect = blitRect(atlas, "focal", 5);
  // 2r scaled by CELL_BOX/CELL: the glyph itself is still 10 across, the extra
  // 3.125 is the halo hanging outside it on both sides.
  expect(rect.dw).toBe(13.125);
  expect(rect.dh).toBe(13.125);
  expect(rect.dw * (CELL / CELL_BOX)).toBe(10);
  expect(rect.dx).toBe(93.4375);
  expect(rect.dy).toBe(193.4375);
  // Centred on the point the caller gave.
  expect(rect.dx + rect.dw / 2).toBe(100);
  expect(rect.dy + rect.dh / 2).toBe(200);
});

// Movement bearing comes from the sampler as atan2(dy, dx) in world space,
// which is directly usable in screen space, and the dart is drawn pointing +x
// so no offset is needed. Callers with nothing to point (a crate, a corpse, a
// player standing still) pass nothing and must get an upright blit.
test("rotates the cell about the marker point only when an angle is given", () => {
  installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });

  const upright = blitRect(atlas, "movingFocal", 5);
  expect(upright.ops.map((o) => o.op)).toEqual(["drawImage"]);

  const turned = blitRect(atlas, "movingFocal", 5, Math.PI / 2);
  expect(turned.ops.map((o) => o.op)).toEqual(["save", "translate", "rotate", "drawImage", "restore"]);
  expect(turned.ops[1]).toEqual({ op: "translate", x: 100, y: 200 });
  expect(turned.ops[2]).toEqual({ op: "rotate", a: Math.PI / 2 });
  // Drawn about the origin the rotation is centred on, so the glyph spins in
  // place rather than orbiting the marker.
  expect(turned.dx).toBe(-turned.dw / 2);
  expect(turned.dy).toBe(-turned.dh / 2);
  expect(turned.dw).toBe(upright.dw);
  // Same cell either way -- rotation is a draw-time transform, not a variant.
  expect(turned.sx).toBe(upright.sx);

  // A bearing of exactly 0 is due east and drawing it upright is the same
  // image, so the cheap path is taken and the transform is left alone.
  expect(blitRect(atlas, "movingFocal", 5, 0).ops.map((o) => o.op)).toEqual(["drawImage"]);
});

test("an unknown kind falls back to the enemy cell", () => {
  installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  const unknown = blitRect(atlas, "no-such-kind");
  const enemy = blitRect(atlas, "enemy");
  expect(unknown.sx).toBe(enemy.sx);
  expect(unknown.sw).toBe(enemy.sw);
});

// The backend resolves vehicleType into bits 2-3 of the flag byte, so the
// renderer holds a code, not a name. Only the two exotic rides earn a glyph;
// every other code is a car, including whatever PUBG adds next.
test("maps every vehicle code to a glyph, and anything out of range to the car", () => {
  expect(vehicleGlyph(0, true)).toBe("vehicleFocal");
  expect(vehicleGlyph(0, false)).toBe("vehicleEnemy");
  expect(vehicleGlyph(1, true)).toBe("planeFocal");
  expect(vehicleGlyph(1, false)).toBe("planeEnemy");
  expect(vehicleGlyph(2, true)).toBe("balloonFocal");
  expect(vehicleGlyph(2, false)).toBe("balloonEnemy");
  // Two bits carry a fourth code the backend does not use yet, and a caller
  // that forgets to mask gets something bigger still. Both ride as a car
  // rather than falling through to a player marker.
  expect(vehicleGlyph(3, true)).toBe("vehicleFocal");
  expect(vehicleGlyph(3, false)).toBe("vehicleEnemy");
  expect(vehicleGlyph(7, false)).toBe("vehicleEnemy");
  expect(vehicleGlyph(undefined, false)).toBe("vehicleEnemy");
  // And every kind it can name is really in the atlas.
  for (const code of [0, 1, 2, 3, 7, undefined]) {
    for (const isFocal of [true, false]) {
      expect(ICON_PATHS, `${code}/${isFocal}`).toHaveProperty(vehicleGlyph(code, isFocal));
    }
  }
});

test("paints every glyph from the palette it was handed", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: COLORS });
  const paint = Object.fromEntries(
    Object.entries(passesByKind(draws)).map(([kind, p]) => [kind, p.colour]),
  );

  expect(paint.focal.colour).toBe(COLORS.focal);
  expect(paint.enemy.colour).toBe(COLORS.enemy);
  expect(paint.dead.colour).toBe(COLORS.dead);
  // A knocked player is still the same player, a player in a vehicle is still
  // that player, and so is one who started running: the state glyphs take the
  // team colour, not one of their own.
  expect(paint.movingFocal.colour).toBe(COLORS.focal);
  expect(paint.movingEnemy.colour).toBe(COLORS.enemy);
  expect(paint.knockedFocal.colour).toBe(COLORS.focal);
  expect(paint.knockedEnemy.colour).toBe(COLORS.enemy);
  expect(paint.vehicleFocal.colour).toBe(COLORS.focal);
  expect(paint.vehicleEnemy.colour).toBe(COLORS.enemy);
  expect(paint.planeFocal.colour).toBe(COLORS.focal);
  expect(paint.planeEnemy.colour).toBe(COLORS.enemy);
  expect(paint.balloonFocal.colour).toBe(COLORS.focal);
  expect(paint.balloonEnemy.colour).toBe(COLORS.enemy);
  expect(paint.crate.colour).toBe(COLORS.crate);
  // A landing chevron carries the same friend/foe read as the dot it belongs
  // to, so it follows the *Focal/*Enemy promise rather than the flight colour.
  expect(paint.chevronFocal.colour).toBe(COLORS.focal);
  expect(paint.chevronEnemy.colour).toBe(COLORS.enemy);
  // The red crate is the one worth crossing the map for.
  expect(paint.crateRed.colour).toBe(COLORS.danger);

  // Paint op is per glyph, not per naming pattern: the state pairs and both
  // crates are solid marks, while the corpse cross and the landing chevron are
  // stroked ticks with no interior to fill.
  expect(paint.dead.op).toBe("stroke");
  expect(paint.chevronFocal.op).toBe("stroke");
  expect(paint.chevronEnemy.op).toBe("stroke");
  for (const kind of [
    "focal", "enemy", "movingFocal", "movingEnemy", "knockedFocal", "knockedEnemy",
    "vehicleFocal", "vehicleEnemy", "planeFocal", "planeEnemy", "balloonFocal",
    "balloonEnemy", "crate", "crateRed",
  ]) {
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
  const paint = Object.fromEntries(
    Object.entries(passesByKind(draws)).map(([kind, p]) => [kind, p.colour]),
  );

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
  // focal/enemy are the same promise under the names the scene already spells
  // them with -- and `enemy` doubles as the unknown-kind cell, so it cannot be
  // renamed into the pattern. Held to the pattern's rule by hand instead.
  expect(ICON_PATHS.enemy).toBe(ICON_PATHS.focal);
  expect(paint.focal.colour).not.toBe(paint.enemy.colour);
});

test("falls back to a built-in colour when the palette is empty", () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: {} });
  expect(draws).toHaveLength(KINDS.length * 2);
  for (const d of draws) expect(typeof d.colour).toBe("string");
});
