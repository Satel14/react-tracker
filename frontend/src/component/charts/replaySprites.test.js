import {
  buildAtlas, vehicleGlyph, ICON_PATHS,
  TEAM_COLORS, DEFAULT_COLOR_INDEX, teamColor, teamColorIndex,
} from "./replaySprites";

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

// The colour axis, held here as a literal for the same reason: growing the
// palette costs a whole atlas row, so the number has to be re-argued here.
const TEAM_COLOR_CAP = 12;

// Which glyph FORM each kind takes its team colour from -- the colour axis
// repaints shapes, not kinds, so movingFocal and movingEnemy share one cell per
// colour. Spelled out rather than derived from a suffix: `enemy`/`focal` carry
// no suffix, and the chevron pair does carry one but is deliberately NOT
// team-coloured, so a suffix rule would silently pull it in.
const TEAM_FORM_OF = {
  focal: "focal",
  enemy: "focal",
  movingFocal: "movingFocal",
  movingEnemy: "movingFocal",
  parachuteFocal: "parachuteFocal",
  parachuteEnemy: "parachuteFocal",
  knockedFocal: "knockedFocal",
  knockedEnemy: "knockedFocal",
  vehicleFocal: "vehicleFocal",
  vehicleEnemy: "vehicleFocal",
  bikeFocal: "bikeFocal",
  bikeEnemy: "bikeFocal",
  truckFocal: "truckFocal",
  truckEnemy: "truckFocal",
  boatFocal: "boatFocal",
  boatEnemy: "boatFocal",
  planeFocal: "planeFocal",
  planeEnemy: "planeFocal",
  balloonFocal: "balloonFocal",
  balloonEnemy: "balloonFocal",
};

// Declaration order matters: it is the order buildAtlas rasterises a team row.
const TEAM_FORMS = [...new Set(Object.values(TEAM_FORM_OF))];

// The four forms added for the descent and the three rides the car used to
// stand in for. Listed by hand: the point of the list is that each one is a
// deliberate addition to the sheet, not a shape that appeared by derivation.
const NEW_FORMS = ["parachuteFocal", "bikeFocal", "truckFocal", "boatFocal"];

// A corpse belongs to nobody, the crates encode contents rather than ownership,
// and the landing chevron keeps its friend/foe read. These take no team colour.
const PLAIN_KINDS = ["dead", "crate", "crateRed", "chevronFocal", "chevronEnemy"];

// Hues, in degrees, of the encodings already on this map, measured off
// style/_tokens.scss. A team colour that lands on one of these is a wrong
// answer, not a dim one: every entry is a marker-sized glyph or the focal read.
// --flight (~193), the next-zone ring (~207) and the outside wash (~221) are
// deliberately absent -- see the HUE_ARCS comment for the collision the palette
// knowingly accepts there.
const CLAIMED_HUES = {
  danger: 0, zoneRed: 3.2, warn: 25.5, zoneStorm: 39.3,
  brand: 54, ok: 142.7, zoneEmp: 254.6, crate: 317.1,
};

const hslParts = (css) => {
  const m = /^hsl\((-?[\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(css);
  expect(m, `not an hsl() colour: ${css}`).not.toBeNull();
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
};

// Hue is a circle, so 350 and 10 are 20 apart, not 340.
const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

const teamHue = (index) => hslParts(teamColor(index)).h;

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
// endpoints -- is represented. Each list carries a `closed` flag: a fill closes
// every subpath implicitly, but a STROKE only paints the segments that are
// there, and the parachute's canopy is an open half-circle whose closing chord
// would otherwise be counted as ink nobody draws.
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
      current.closed = false;
      subpaths.push(current);
      cx = next();
      cy = next();
      push(cx, cy);
    } else if (cmd === "Z") {
      if (current) current.closed = true;
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

// The whole sheet, exactly: row 0 is every kind, then one row per team colour
// holding only the six team forms. Kept as an exact count rather than a floor
// -- a row that quietly stopped being rasterised has to fail here.
const TOTAL_DRAWS = (KINDS.length + TEAM_FORMS.length * TEAM_COLOR_CAP) * 2;

// Row 0. Every kind is painted twice, halo then colour, in declaration order,
// and row 0 comes first so these indices are the ones they always were.
const passesByKind = (draws) => {
  expect(draws).toHaveLength(TOTAL_DRAWS);
  return Object.fromEntries(
    KINDS.map((kind, i) => [kind, { halo: draws[i * 2], colour: draws[i * 2 + 1] }]),
  );
};

// Rows 1..TEAM_COLOR_CAP, indexed [colourIndex - 1][form]. Walks the tail of
// the same draw list and asserts it ends exactly where the sheet does, so an
// extra or missing team pass cannot hide behind a slice.
const teamPasses = (draws) => {
  expect(draws).toHaveLength(TOTAL_DRAWS);
  const rows = [];
  let i = KINDS.length * 2;
  for (let ci = 1; ci <= TEAM_COLOR_CAP; ci += 1) {
    const row = {};
    for (const form of TEAM_FORMS) {
      row[form] = { halo: draws[i], colour: draws[i + 1] };
      i += 2;
    }
    rows.push(row);
  }
  expect(i).toBe(draws.length);
  return rows;
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

// The source/destination rectangle blit actually samples for one kind. Called
// with four arguments it exercises the pre-team call shape exactly -- six
// arguments reaching blit, no colour index -- which is what the scene ships
// today and what must not change.
const blitRect = (atlas, kind, r = 5, angle, ...colorIndex) => {
  const target = fakeTarget();
  atlas.blit(target, kind, 100, 200, r, angle, ...colorIndex);
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
    "balloonEnemy", "balloonFocal", "bikeEnemy", "bikeFocal", "boatEnemy", "boatFocal",
    "chevronEnemy", "chevronFocal", "crate", "crateRed", "dead", "enemy", "focal",
    "knockedEnemy", "knockedFocal", "movingEnemy", "movingFocal", "parachuteEnemy",
    "parachuteFocal", "planeEnemy", "planeFocal", "truckEnemy", "truckFocal",
    "vehicleEnemy", "vehicleFocal",
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
    // Filling the box on ONE axis, not both. The hand-drawn glyphs were built
    // to fill it on both, but the vehicle and corpse marks are traced from
    // real art and stretching a car to be as tall as it is wide would be a
    // distortion, not an inscription. One axis is still enough to fix the
    // on-screen size, which is what the rule is for.
    expect(Math.max(box.width, box.height), kind).toBeCloseTo(BOX_MAX - BOX_MIN, 5);
  }
});

// The vehicle and corpse marks are traced from the map markers PUBG's own
// replay tools draw, not drawn here. What used to be pinned in their place --
// how many blocks reach the full depth of the box, whether the nose tapers to
// a point -- was a vocabulary for hand-drawn glyphs and describes nothing
// about a traced contour. Two things about the tracing are worth holding.
test("the traced marks keep the holes that make them readable", () => {
  // These icons are a light body with the detail drawn into it in black:
  // wheels, a window, eye sockets. Threshold them on alpha and all of that
  // flattens into one blob -- the first pass did exactly that and produced a
  // car nobody could name. Masking on luminance leaves the dark linework
  // outside the mask, and it comes back as holes wound the other way.
  for (const kind of ["vehicleFocal", "bikeFocal", "dead"]) {
    const areas = subpathAreas(ICON_PATHS[kind]).filter((a) => Math.abs(a) > 1e-6);
    expect(areas.length, kind).toBeGreaterThan(1);
    expect(new Set(areas.map((a) => Math.sign(a))).size, kind).toBe(2);
    // The holes are the small ones. A body smaller than its own wheels would
    // mean the winding came out inverted and the glyph renders as a negative.
    const [body] = [...areas].sort((a, b) => Math.abs(b) - Math.abs(a));
    const holes = areas.filter((a) => Math.sign(a) !== Math.sign(body));
    for (const hole of holes) expect(Math.abs(hole)).toBeLessThan(Math.abs(body));
  }
});

test("one car stands for every car", () => {
  // A van and a sedan are the same thing to a reader following a fight, and
  // two silhouettes that mean the same thing cost more to tell apart than
  // they are worth. Kept as separate KINDS so the payload's vehicle codes and
  // the team-colour rows need no change; they simply draw the same picture.
  expect(ICON_PATHS.truckFocal).toBe(ICON_PATHS.vehicleFocal);
  expect(ICON_PATHS.truckEnemy).toBe(ICON_PATHS.vehicleEnemy);
});

// ---------------------------------------------------------------------------
// Silhouette separation
// ---------------------------------------------------------------------------

// The checks above ask WHERE a glyph's ink sits -- how many full-height blocks,
// which end the nose tapers to. A pair can satisfy every one of them and still
// be one shape drawn twice: the boat's wedge sat entirely INSIDE the truck's
// box, and the balloon's canopy was the standing player's disc with the corners
// rounded differently. Neither showed up until the overlap was measured, which
// is what this does -- intersection over union of the two shapes as painted.
//
// IoU between two shapes is scale-free: the same pair overlaps by the same
// fraction at the 10 CSS px an enemy blits at and at the 16 a selected one
// does. That is the finding worth keeping, because it rules out the obvious
// fix -- a marker the reader cannot resolve does not become resolvable by
// being drawn bigger. What separates two glyphs at 10 px is how much ink each
// carries and whether it is solid or hollow, not the shape of its outline.
const GRID = 64;

// Two shapes may cover at most this much of each other. Not a perceptual
// threshold -- there is no such number for silhouettes -- but the level that
// admits every pair a reader can currently tell apart on the map and rejects
// the four that were measured as collisions.
const OVERLAP_CEILING = 0.65;

// One per shape a player's marker can take. Focal and enemy variants share a
// path, so only one of each pair is listed; the crates and the landing chevron
// are not player markers and never stand where one does.
// One entry per DISTINCT silhouette a marker can take. The truck is absent on
// purpose: it draws the car, so measuring the pair would only ever report the
// 1.000 that "one car stands for every car" already pins deliberately.
const MARKER_SHAPES = [
  "enemy", "movingEnemy", "parachuteEnemy", "knockedEnemy", "dead",
  "vehicleEnemy", "bikeEnemy", "boatEnemy", "planeEnemy", "balloonEnemy",
];

// Pairs still over the ceiling, each with the figure measured when it was
// accepted. Both are collisions with the standing player's disc, which this
// pass deliberately left alone: it is the most common marker on the map and
// the one every reader already knows, so it is the wrong end of the pair to
// redraw. `max` is a one-way ratchet -- a pair may improve and the entry can
// then be tightened, but an entry that stops being needed fails outright.
const ACCEPTED_OVERLAP = [
  {
    pair: "enemy/dead",
    max: 0.75,
    why: "A skull at 10 px is a disc with two notches. It is the only kind painted in a colour no live marker can take -- dead is deliberately absent from TEAM_FORM -- so the shape is not the only channel telling it from a player.",
  },
  {
    pair: "enemy/knockedEnemy",
    max: 0.68,
    why: "The ring IS the disc with a hole punched in it, and the hole is what carries the meaning.",
  },
];

// Nonzero winding -- the rule the atlas fills with, so the knocked ring reads
// as a ring rather than as a disc.
const windingAt = (subpaths, px, py) => {
  let winding = 0;
  for (const pts of subpaths) {
    for (let i = 0; i < pts.length; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const side = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
      if (y0 <= py) {
        if (y1 > py && side > 0) winding += 1;
      } else if (y1 <= py && side < 0) winding -= 1;
    }
  }
  return winding;
};

// A stroked glyph has no fill at all: its ink is the band within half a line
// width of the path, and an open subpath contributes no closing segment.
const withinStroke = (subpaths, px, py, width) => {
  const limit = (width / 2) * (width / 2);
  for (const pts of subpaths) {
    const last = pts.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len)) : 0;
      const ex = px - (x0 + t * dx);
      const ey = py - (y0 + t * dy);
      if (ex * ex + ey * ey <= limit) return true;
    }
  }
  return false;
};

// Whether the kind is filled or stroked comes from the pass the atlas actually
// painted, not from a copy of PAINT kept here: a stroke width that changed in
// one place and not the other would otherwise be measured as the shape nobody
// draws.
const glyphMask = (kind, colourPass) => {
  const subpaths = pathPoints(ICON_PATHS[kind]);
  const stroked = colourPass.op === "stroke";
  const mask = new Uint8Array(GRID * GRID);
  for (let gy = 0; gy < GRID; gy += 1) {
    const py = ((gy + 0.5) * CELL) / GRID;
    for (let gx = 0; gx < GRID; gx += 1) {
      const px = ((gx + 0.5) * CELL) / GRID;
      const inked = stroked
        ? withinStroke(subpaths, px, py, colourPass.lineWidth)
        : windingAt(subpaths, px, py) !== 0;
      if (inked) mask[gy * GRID + gx] = 1;
    }
  }
  return mask;
};

const inkOf = (mask) => mask.reduce((total, on) => total + on, 0);

const overlapOf = (a, b) => {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] && b[i]) both += 1;
    if (a[i] || b[i]) either += 1;
  }
  return either ? both / either : 1;
};

const markerMasks = () => {
  const { draws } = installAtlasEnv();
  buildAtlas({ dpr: 1, colors: COLORS });
  const passes = passesByKind(draws);
  return Object.fromEntries(MARKER_SHAPES.map((k) => [k, glyphMask(k, passes[k].colour)]));
};

const overlapPairs = (masks) => {
  const pairs = [];
  for (let i = 0; i < MARKER_SHAPES.length; i += 1) {
    for (let j = i + 1; j < MARKER_SHAPES.length; j += 1) {
      pairs.push({
        pair: `${MARKER_SHAPES[i]}/${MARKER_SHAPES[j]}`,
        overlap: overlapOf(masks[MARKER_SHAPES[i]], masks[MARKER_SHAPES[j]]),
      });
    }
  }
  return pairs;
};

test("no two marker shapes cover the same ground", () => {
  const masks = markerMasks();

  // A glyph that sampled to nothing would overlap nothing and sail through
  // every assertion below. The floor is loose on purpose -- the lightest glyph
  // here is the bike, at about a quarter of the grid.
  for (const kind of MARKER_SHAPES) {
    expect(inkOf(masks[kind]), kind).toBeGreaterThan(GRID * GRID * 0.05);
  }

  const allowed = new Map(ACCEPTED_OVERLAP.map((a) => [a.pair, a.max]));
  const tooAlike = overlapPairs(masks)
    .filter(({ pair, overlap }) => overlap > (allowed.get(pair) ?? OVERLAP_CEILING))
    .map(({ pair, overlap }) => `${pair} ${overlap.toFixed(3)}`);

  expect(tooAlike, "redraw one of each pair, or accept it in ACCEPTED_OVERLAP with why").toEqual([]);
});

// The measurement above is only worth its numbers if it measures what the
// atlas paints. A fill closes every subpath implicitly; a stroke paints only
// the segments that are there, and the parachute's canopy is an open arc whose
// closing chord would turn it into a solid dome nobody draws.
test("a stroked glyph is measured without the segments its path does not have", () => {
  const masks = markerMasks();
  const canopy = pathPoints(ICON_PATHS.parachuteEnemy)[0];

  expect(canopy.closed).toBe(false);
  // Grid cell (31, 31) sits at (15.75, 15.75): a quarter of a unit off the
  // chord from (2 16) to (30 16), and 4.9 units from the nearest shroud. It
  // can only be inked by a segment that is not in the path.
  expect(masks.parachuteEnemy[31 * GRID + 31]).toBe(0);
});

test("keeps no allowance for an overlap that is gone", () => {
  const pairs = new Map(overlapPairs(markerMasks()).map((p) => [p.pair, p.overlap]));

  for (const { pair, max, why } of ACCEPTED_OVERLAP) {
    expect(pairs.has(pair), `${pair} is not a pair of marker shapes`).toBe(true);
    expect(why.length, `${pair} has no reason recorded`).toBeGreaterThan(20);
    // Still over the ceiling, so the allowance is still doing something, and
    // still under its own figure, so it can only ever be tightened.
    expect(pairs.get(pair), `${pair} no longer needs its allowance -- delete it`)
      .toBeGreaterThan(OVERLAP_CEILING);
    expect(pairs.get(pair), `${pair} has got worse than the figure it was accepted at`)
      .toBeLessThanOrEqual(max);
  }
});

// The canopy has an up, which every other glyph here does not. That makes it
// the one shape a caller can ruin by doing the normal thing -- the scene aims
// every marker that is moving, and a descending player is always moving. The
// guard is in drawScene; this pins the property that makes the guard necessary,
// so nobody removes it thinking the shape is rotation-proof.
test("the canopy is an outline with open shrouds, not a solid wedge", () => {
  const subs = pathPoints(ICON_PATHS.parachuteFocal);
  // A canopy arc plus three separate shrouds. Filled, or joined into one
  // subpath, they merge into a solid triangle and it stops reading as a
  // parachute -- the gaps are half of what makes the shape recognisable.
  expect(subs.length).toBeGreaterThan(1);

  const all = subs.flat();
  const ys = all.map(([, y]) => y);
  const xs = all.map(([x]) => x);
  expect(Math.min(...ys)).toBeCloseTo(2, 5);
  expect(Math.max(...ys)).toBeCloseTo(30, 5);
  expect(Math.min(...xs)).toBeCloseTo(2, 5);
  expect(Math.max(...xs)).toBeCloseTo(30, 5);

  // Every shroud ends at the same point below centre, and the canopy spans the
  // full width above it: a canopy over converging lines, not a blob. Rotating
  // that would hang it sideways, which is why drawScene exempts it.
  const turned = all.map(([x, y]) => [16 - (y - 16), 16 + (x - 16)]);
  const same = turned.every(([x, y]) =>
    all.some(([px, py]) => Math.abs(px - x) < 0.02 && Math.abs(py - y) < 0.02));
  expect(same).toBe(false);
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
  // The knocked ring punches its hole to read as a ring; the traced marks
  // punch theirs because the wheels and eye sockets are holes in the real art.
  expect(holed.sort()).toEqual([
    "bikeEnemy", "bikeFocal", "dead", "knockedEnemy", "knockedFocal",
    "truckEnemy", "truckFocal", "vehicleEnemy", "vehicleFocal",
  ]);

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
  expect(canvas.height).toBe(size * (TEAM_COLOR_CAP + 1));
  // One sheet, one column per kind and one row per colour, so a kind widens it
  // and a colour heightens it. A browser canvas caps out well above this, but
  // not infinitely far above it, and BOTH axes have to stay under.
  expect(canvas.width).toBe(2100);
  expect(canvas.height).toBe(1092);
  expect(canvas.width).toBeLessThan(4096);
  expect(canvas.height).toBeLessThan(4096);

  // Row 0 first, each glyph drawn twice, in declaration order, scaled so its
  // PADDED box -- not its 32-unit design box -- covers the rasterised cell, and
  // shifted by PAD so it sits in the middle of it. The team rows that follow
  // are pinned by the grid test below; this half must stay the sheet it was.
  const row0 = draws.slice(0, KINDS.length * 2);
  expect(row0.map((d) => d.d)).toEqual(KINDS.flatMap((k) => [ICON_PATHS[k], ICON_PATHS[k]]));
  row0.forEach((d, i) => {
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

  // The team rows are the same glyph in a different colour, so they carry the
  // same halo, in the same order. A row rasterised without one would look fine
  // on Erangel and vanish on Vikendi -- the exact defect the halo exists for.
  teamPasses(draws).forEach((row, i) => {
    for (const form of TEAM_FORMS) {
      const { halo, colour } = row[form];
      const at = `${form}@${i + 1}`;
      expect(halo.op, at).toBe("stroke");
      expect(halo.colour, at).toBe(COLORS.outline);
      expect(halo.d, at).toBe(ICON_PATHS[form]);
      expect(colour.d, at).toBe(ICON_PATHS[form]);
      expect(colour.colour, at).not.toBe(COLORS.outline);
      expect(halo.lineWidth, at).toBeGreaterThan(colour.op === "stroke" ? colour.lineWidth : 0);
    }
  });
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

// The backend resolves 54 distinct vehicleIds into six groups and packs the
// group into bits 2-4 of the flag byte, so the renderer holds a code, not a
// name. All eight codes those three bits can carry are spelled out: six are
// allocated and the other two are not, and the whole point of the last rule is
// that an unallocated code still draws a VEHICLE.
test("maps every vehicle code to a glyph, and anything out of range to the car", () => {
  // Index is the code. 6 and 7 are unallocated and ride as a car.
  const BY_CODE = ["vehicle", "plane", "balloon", "bike", "truck", "boat", "vehicle", "vehicle"];
  BY_CODE.forEach((form, code) => {
    expect(vehicleGlyph(code, true), `code ${code}`).toBe(`${form}Focal`);
    expect(vehicleGlyph(code, false), `code ${code}`).toBe(`${form}Enemy`);
  });

  // A caller that forgets to mask gets something bigger still, and a code the
  // table cannot answer for is anything but an integer in range. All of them
  // ride as a car rather than falling through to a player marker -- a driver
  // drawn as a pedestrian is a wrong answer, not a rough one. "length" and
  // "constructor" are the ones that bite: the table is an Array, so without an
  // integer check they would name kinds "6Focal" and "function Array()...".
  for (const bad of [
    8, 99, -1, 1.5, NaN, Infinity, undefined, null, true,
    "1", "length", "constructor", {}, [],
  ]) {
    expect(vehicleGlyph(bad, true), String(bad)).toBe("vehicleFocal");
    expect(vehicleGlyph(bad, false), String(bad)).toBe("vehicleEnemy");
  }

  // And every kind it can name is really in the atlas -- and takes a team
  // colour, so a teammate's ride still blits in their team's colour rather than
  // dropping to the row that means "mine".
  for (const code of [0, 1, 2, 3, 4, 5, 6, 7, 8, -1, undefined, "length"]) {
    for (const isFocal of [true, false]) {
      const kind = vehicleGlyph(code, isFocal);
      expect(ICON_PATHS, `${code}/${isFocal}`).toHaveProperty(kind);
      expect(TEAM_FORM_OF, `${code}/${isFocal}`).toHaveProperty(kind);
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
  // The same promise for the descent and for the three rides the car used to
  // stand in for: a state and a ride are shapes, never colours of their own.
  expect(paint.parachuteFocal.colour).toBe(COLORS.focal);
  expect(paint.parachuteEnemy.colour).toBe(COLORS.enemy);
  expect(paint.bikeFocal.colour).toBe(COLORS.focal);
  expect(paint.bikeEnemy.colour).toBe(COLORS.enemy);
  expect(paint.truckFocal.colour).toBe(COLORS.focal);
  expect(paint.truckEnemy.colour).toBe(COLORS.enemy);
  expect(paint.boatFocal.colour).toBe(COLORS.focal);
  expect(paint.boatEnemy.colour).toBe(COLORS.enemy);
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
  // The corpse mark is a filled skull traced from the real marker, where it
  // used to be a stroked cross drawn here.
  expect(paint.dead.op).toBe("fill");
  expect(paint.chevronFocal.op).toBe("stroke");
  expect(paint.chevronEnemy.op).toBe("stroke");
  // The canopy joins them: filled, it and its shrouds merge into one solid
  // wedge and it stops reading as a parachute at all.
  expect(paint.parachuteFocal.op).toBe("stroke");
  expect(paint.parachuteEnemy.op).toBe("stroke");
  // So does the balloon, and for it that is the whole separation rather than a
  // drawing preference. Solid, it covered most of the standing player's disc,
  // because a hand-drawn glyph fills the same 28-unit box and two filled boxes
  // must overlap. Hollow is the one channel a filled glyph cannot follow it
  // into, so flipping it back to a fill undoes the fix. The separation test is
  // what measures the damage; this is what names the cause.
  //
  // The truck was hollow for the same reason and is not any more: it stopped
  // being a shape of its own and became the car.
  expect(paint.balloonFocal.op).toBe("stroke");
  expect(paint.balloonEnemy.op).toBe("stroke");
  for (const kind of [
    "focal", "enemy", "movingFocal", "movingEnemy",
    "knockedFocal", "knockedEnemy", "vehicleFocal", "vehicleEnemy", "bikeFocal",
    "bikeEnemy", "boatFocal", "boatEnemy", "planeFocal", "planeEnemy",
    "crate", "crateRed",
  ]) {
    expect(paint[kind].op, kind).toBe("fill");
  }

  // A wall too thin to see is not a glyph. haloWidth is the wall plus HALO on
  // each side, so a hairline colour band sits inside a halo six units wider
  // than itself and the marker blits as a dark blob in nobody's team colour.
  for (const kind of [
    "dead", "chevronFocal", "chevronEnemy", "parachuteFocal", "parachuteEnemy",
    "truckFocal", "truckEnemy", "balloonFocal", "balloonEnemy",
  ]) {
    expect(paint[kind].lineWidth, kind).toBeGreaterThanOrEqual(2);
  }

  // 2 is only enough because the scene draws the canopy at its own, larger
  // radius: blit maps 32 design units onto 2r, so a 2-unit wall is 1.1 CSS px
  // at the parachute's r = 9 and 0.6 at a plain marker's r = 5. The balloon
  // blits at the plain radius, and hollow only separates it from the solid
  // markers while its wall can be seen, so it carries a full HALO. The truck
  // was here too until it stopped being drawn and became the car.
  for (const kind of ["balloonFocal", "balloonEnemy"]) {
    expect(paint[kind].lineWidth, kind).toBeGreaterThanOrEqual(HALO);
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
  expect(draws).toHaveLength(TOTAL_DRAWS);
  for (const d of draws) expect(typeof d.colour).toBe("string");
});

// ---------------------------------------------------------------------------
// Team colours
// ---------------------------------------------------------------------------

// Which kinds take a team colour is a decision, not a naming accident: it is
// what sizes every team row. Listed both ways round so neither half can drift
// -- an eleventh form added without a kind, or a kind quietly dropped out of
// the palette, breaks this before it breaks a cell address.
test("exactly the ten player and vehicle forms take a team colour", () => {
  expect(TEAM_FORMS).toEqual([
    "focal", "movingFocal", "parachuteFocal", "knockedFocal", "vehicleFocal",
    "bikeFocal", "truckFocal", "boatFocal", "planeFocal", "balloonFocal",
  ]);
  expect([...Object.keys(TEAM_FORM_OF), ...PLAIN_KINDS].sort()).toEqual([...KINDS].sort());
  // Every form is a real kind, and a form's whole point is that two kinds share
  // its shape -- so the pair really is one cell's worth of drawing, not two.
  for (const [kind, form] of Object.entries(TEAM_FORM_OF)) {
    expect(ICON_PATHS, form).toHaveProperty(form);
    expect(ICON_PATHS[kind], kind).toBe(ICON_PATHS[form]);
  }
});

test("maps a team to a colour index and keeps the focal team out of the palette", () => {
  expect(TEAM_COLORS).toBe(TEAM_COLOR_CAP);
  expect(DEFAULT_COLOR_INDEX).toBe(0);

  // Requirement 1. The viewer's own team is never assigned a palette entry: it
  // takes index 0, which is the row that paints colors.focal.
  expect(teamColorIndex(7, 7)).toBe(DEFAULT_COLOR_INDEX);
  expect(teamColorIndex(0, 0)).toBe(DEFAULT_COLOR_INDEX);
  expect(teamColor(DEFAULT_COLOR_INDEX)).toBeNull();

  // Everyone else lands on a real palette row.
  for (let id = 1; id <= 40; id += 1) {
    if (id === 7) continue;
    const index = teamColorIndex(id, 7);
    expect(index, `team ${id}`).toBeGreaterThanOrEqual(1);
    expect(index, `team ${id}`).toBeLessThanOrEqual(TEAM_COLORS);
  }

  // A caller that does not know which team is the viewer's still gets colours.
  expect(teamColorIndex(7)).not.toBe(DEFAULT_COLOR_INDEX);
  expect(teamColorIndex(7, null)).not.toBe(DEFAULT_COLOR_INDEX);
  expect(teamColorIndex(7, undefined)).not.toBe(DEFAULT_COLOR_INDEX);

  // An id that is not a number falls back to today's two-colour read rather
  // than hashing to some arbitrary team's colour. Number.isFinite does not
  // coerce, which is why "3" and null land here and not on a row.
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, "3", {}, []]) {
    expect(teamColorIndex(bad, 7), String(bad)).toBe(DEFAULT_COLOR_INDEX);
  }
  // A negative id is still an id: the modulo is taken the non-negative way.
  for (const id of [-1, -5, -13]) {
    expect(teamColorIndex(id, 7), String(id)).toBeGreaterThanOrEqual(1);
    expect(teamColorIndex(id, 7), String(id)).toBeLessThanOrEqual(TEAM_COLORS);
  }
});

// Requirement 2. Team ids are small integers and the teams that fight each
// other are usually numerically close, so `hue = id * step` is exactly wrong.
// The stride scatters consecutive ids across the wheel instead.
test("adjacent team ids get hues that are nowhere near each other", () => {
  for (let id = 1; id <= 40; id += 1) {
    const gap = hueGap(teamHue(teamColorIndex(id, 0)), teamHue(teamColorIndex(id + 1, 0)));
    expect(gap, `${id} -> ${id + 1}`).toBeGreaterThan(90);
  }
  // Two apart is the next-worst case and still must not be a near-miss.
  for (let id = 1; id <= 40; id += 1) {
    const gap = hueGap(teamHue(teamColorIndex(id, 0)), teamHue(teamColorIndex(id + 2, 0)));
    expect(gap, `${id} -> ${id + 2}`).toBeGreaterThan(25);
  }
});

test("the palette uses every colour once before repeating, then wraps", () => {
  const first = [];
  for (let id = 1; id <= TEAM_COLORS; id += 1) first.push(teamColorIndex(id, 0));
  expect(new Set(first).size).toBe(TEAM_COLORS);
  expect(new Set(first)).toEqual(new Set(Array.from({ length: TEAM_COLORS }, (_, i) => i + 1)));

  // Past the cap the sheet stops growing and the hues come round again -- the
  // 13th team shares with the 1st rather than earning a row nobody could tell
  // from an existing one.
  for (let id = 1; id <= 30; id += 1) {
    expect(teamColorIndex(id + TEAM_COLORS, 0), String(id)).toBe(teamColorIndex(id, 0));
  }
  // A 25-team squad lobby is the real case: at most three teams to a colour.
  const counts = new Map();
  for (let id = 1; id <= 25; id += 1) {
    const i = teamColorIndex(id, 0);
    counts.set(i, (counts.get(i) || 0) + 1);
  }
  expect(Math.max(...counts.values())).toBe(3);
});

test("teamColor answers only for real palette entries", () => {
  for (const bad of [0, -1, TEAM_COLORS + 1, 99, 1.5, NaN, undefined, null, "2", {}]) {
    expect(teamColor(bad), String(bad)).toBeNull();
  }
  const seen = new Set();
  for (let i = 1; i <= TEAM_COLORS; i += 1) {
    expect(typeof teamColor(i), String(i)).toBe("string");
    seen.add(teamColor(i));
  }
  expect(seen.size).toBe(TEAM_COLORS);
});

// Requirement 2, the other half: it is not enough that neighbouring ids differ,
// every pair in the palette has to be tellable apart at marker size.
test("no two palette colours share a hue, and none is a near-miss", () => {
  const hues = Array.from({ length: TEAM_COLORS }, (_, i) => teamHue(i + 1));
  for (let i = 0; i < hues.length; i += 1) {
    for (let j = i + 1; j < hues.length; j += 1) {
      expect(hueGap(hues[i], hues[j]), `${i + 1} vs ${j + 1}`).toBeGreaterThanOrEqual(15);
    }
  }
});

// Requirement 3. The map already spends most of the wheel: kill tracers and the
// red crate are red, gunfire amber, the selection ring yellow, the focal team
// green, loot pins magenta, the EMP zone violet. A team hue landing on one of
// those reads as that thing.
test("no team hue lands on an encoding the map already uses", () => {
  for (let i = 1; i <= TEAM_COLORS; i += 1) {
    for (const [name, claimed] of Object.entries(CLAIMED_HUES)) {
      expect(hueGap(teamHue(i), claimed), `colour ${i} vs ${name}`).toBeGreaterThan(12);
    }
  }
});

// Hue distance is not perceptual distance: fifteen degrees is a different
// amount of "different" in the greens than in the blues. CIE Lab is, near
// enough, so the property worth holding is stated there. Plain sRGB -> Lab, D65.
const labOf = (css) => {
  const { h, s, l } = hslParts(css);
  const H = h / 360, S = s / 100, L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const k = (n) => (n + H * 12) % 12;
  const ch = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (v) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);
  const [r, g, b] = [ch(0), ch(8), ch(4)].map(lin);
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};

// Requirement: two teams are two colours. A map carries every one of the twelve
// at once, so it is not enough that consecutive team ids get distant hues --
// no PAIR anywhere in the palette may be a pair a viewer has to squint at.
//
// This is the test that was missing. Hue spacing and the lightness tilt were
// both pinned and both passed while colours 3 and 4 -- two greens 15 degrees
// apart, where the tilt is flat -- sat 8.2 apart in Lab, the only pair of
// sixty-six under 10. Alternating saturation moved the floor to 13.0.
test("no two team colours are perceptually close", () => {
  const palette = Array.from({ length: TEAM_COLORS }, (_, i) => teamColor(i + 1));
  const labs = palette.map(labOf);
  let worst = Infinity;
  let at = "";
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      const d = Math.hypot(labs[i][0] - labs[j][0], labs[i][1] - labs[j][1], labs[i][2] - labs[j][2]);
      if (d < worst) { worst = d; at = `colour ${i + 1} (${palette[i]}) vs ${j + 1} (${palette[j]})`; }
    }
  }
  expect(worst, `closest pair is ${at}`).toBeGreaterThan(12);
});

// Requirement 4. The raster underneath is photographic -- pale desert, dark
// forest, white snow. The halo does most of the work, but a near-black or
// washed-out fill inside it is still a marker nobody can name.
test("every team colour stays saturated and mid-light", () => {
  const palette = Array.from({ length: TEAM_COLORS }, (_, i) => hslParts(teamColor(i + 1)));
  for (const [i, { s, l }] of palette.entries()) {
    expect(s, `colour ${i + 1}`).toBeGreaterThanOrEqual(70);
    expect(l, `colour ${i + 1}`).toBeGreaterThanOrEqual(50);
    expect(l, `colour ${i + 1}`).toBeLessThanOrEqual(75);
  }

  // One lightness for every hue is not one lightness to the eye: at 55% a blue
  // is a navy that sinks into a forest raster while a yellow-green is a bright
  // lime. So the blues have to come out measurably lighter than the yellow-
  // greens -- by construction, not by luck.
  const near = (h) => palette.filter((c) => hueGap(c.h, h) < 60).map((c) => c.l);
  const yellowish = near(60);
  const blueish = near(240);
  expect(yellowish.length).toBeGreaterThan(0);
  expect(blueish.length).toBeGreaterThan(0);
  expect(Math.min(...blueish)).toBeGreaterThan(Math.max(...yellowish) + 5);
});

// The blocker this pass exists to solve: the atlas bakes one colour per cell,
// so (ten forms) x (twelve colours) needs ten times twelve cells on top of the
// original row -- and every one of them has to be somewhere no other cell is.
test("the sheet is a form x colour grid and every pair has its own cell", () => {
  const { canvas, draws } = installAtlasEnv();
  const dpr = 2;
  const size = CELL_BOX * dpr;
  const scale = size / CELL_BOX;
  const atlas = buildAtlas({ dpr, colors: COLORS });

  const rows = teamPasses(draws);
  expect(rows).toHaveLength(TEAM_COLOR_CAP);
  rows.forEach((row, i) => {
    const ci = i + 1;
    for (const form of TEAM_FORMS) {
      const at = `${form}@${ci}`;
      const col = KINDS.indexOf(form);
      // A team cell sits in its form's own column, one row down per colour.
      expect(row[form].colour.tx, at).toBe(col * size + PAD * scale);
      expect(row[form].colour.ty, at).toBe(ci * size + PAD * scale);
      expect(row[form].colour.scale, at).toBe(scale);
      expect(row[form].colour.colour, at).toBe(teamColor(ci));
    }
  });

  // And what blit samples is what was painted, for every (kind, colour) pair.
  const cells = new Map();
  for (const kind of KINDS) {
    for (let ci = 0; ci <= TEAM_COLOR_CAP; ci += 1) {
      const at = `${kind}@${ci}`;
      const rect = blitRect(atlas, kind, 5, undefined, ci);
      const teamed = ci > 0 ? TEAM_FORM_OF[kind] : undefined;
      expect(rect.sx, at).toBe(KINDS.indexOf(teamed || kind) * size);
      expect(rect.sy, at).toBe(teamed ? ci * size : 0);
      expect(rect.sw, at).toBe(size);
      expect(rect.sh, at).toBe(size);
      // Never off the sheet on either axis.
      expect(rect.sx + rect.sw, at).toBeLessThanOrEqual(canvas.width);
      expect(rect.sy + rect.sh, at).toBeLessThanOrEqual(canvas.height);
      const cellKey = `${rect.sx},${rect.sy}`;
      if (!cells.has(cellKey)) cells.set(cellKey, []);
      cells.get(cellKey).push(at);
    }
  }
  // 25 default cells plus 10 forms x 12 colours: the two kinds sharing a form
  // share its cell (that is the point), nothing else does.
  expect(cells.size).toBe(KINDS.length + TEAM_FORMS.length * TEAM_COLOR_CAP);

  // Every cell blit can reach was actually rasterised -- no address points at
  // one of the eleven columns a team row leaves empty.
  const painted = new Set(draws.map((d) => `${d.tx - PAD * scale},${d.ty - PAD * scale}`));
  for (const cellKey of cells.keys()) expect([...painted], cellKey).toContain(cellKey);
});

// The four new forms are team forms like any other, and this is the promise
// that says so: a teammate who mounts a bike, a truck or a boat, or who is
// still under canopy, keeps their team's colour rather than dropping to the row
// that means "mine" or borrowing the enemy's. Spelled out per form and per
// colour, because a form missing from the table costs no test above -- the grid
// walks whatever the table happens to hold.
test("the descent and the three new rides carry a team colour in every row", () => {
  const { draws } = installAtlasEnv();
  const dpr = 2;
  const size = CELL_BOX * dpr;
  const atlas = buildAtlas({ dpr, colors: COLORS });
  const rows = teamPasses(draws);

  for (const form of NEW_FORMS) {
    expect(TEAM_FORMS, form).toContain(form);
    const enemyKind = `${form.slice(0, -"Focal".length)}Enemy`;
    expect(ICON_PATHS, enemyKind).toHaveProperty(enemyKind);

    rows.forEach((row, i) => {
      const at = `${form}@${i + 1}`;
      expect(row[form].colour.d, at).toBe(ICON_PATHS[form]);
      expect(row[form].colour.colour, at).toBe(teamColor(i + 1));
      expect(row[form].colour.colour, at).not.toBe(COLORS.focal);
      expect(row[form].colour.colour, at).not.toBe(COLORS.enemy);
    });

    // Both spellings of the kind reach that one cell, in every colour row.
    for (let ci = 1; ci <= TEAM_COLOR_CAP; ci += 1) {
      const at = `${form}@${ci}`;
      const focalCell = blitRect(atlas, form, 5, undefined, ci);
      const enemyCell = blitRect(atlas, enemyKind, 5, undefined, ci);
      expect(focalCell.sy, at).toBe(ci * size);
      expect(enemyCell.sx, at).toBe(focalCell.sx);
      expect(enemyCell.sy, at).toBe(focalCell.sy);
    }
    // ...and with no colour index they are still two cells, one per side.
    expect(blitRect(atlas, enemyKind).sx).not.toBe(blitRect(atlas, form).sx);
  }
});

// The signature change has to be invisible to the caller that has not been
// wired up yet. `colorIndex` is appended after the already-optional `angle`,
// so six arguments -- what the scene passes today -- still reach row 0.
test("a caller that passes no colour index gets exactly the sheet it had", () => {
  installAtlasEnv();
  const dpr = 2;
  const size = CELL_BOX * dpr;
  const atlas = buildAtlas({ dpr, colors: COLORS });

  for (const [i, kind] of KINDS.entries()) {
    const legacy = blitRect(atlas, kind);
    expect(legacy.sy, kind).toBe(0);
    expect(legacy.sx, kind).toBe(i * size);
    // And an explicit 0 -- what teamColorIndex hands back for the focal team
    // and for an unknown one -- is the same cell, not a thirteenth colour.
    const zero = blitRect(atlas, kind, 5, undefined, DEFAULT_COLOR_INDEX);
    expect(zero.sx, kind).toBe(legacy.sx);
    expect(zero.sy, kind).toBe(legacy.sy);
  }

  // Rotation is still a draw-time transform, not a variant: same cell either
  // way, with a colour index as without one.
  const upright = blitRect(atlas, "movingEnemy", 5, undefined, 4);
  const turned = blitRect(atlas, "movingEnemy", 5, Math.PI / 3, 4);
  expect(turned.sx).toBe(upright.sx);
  expect(turned.sy).toBe(upright.sy);
  expect(turned.ops.map((o) => o.op)).toEqual(["save", "translate", "rotate", "drawImage", "restore"]);
});

// A colour index the atlas cannot honour must cost the marker its colour, never
// its existence: an undrawn player is a worse bug than a mis-coloured one.
test("an unusable colour index degrades to the default cell rather than drawing nothing", () => {
  installAtlasEnv();
  const dpr = 2;
  const size = CELL_BOX * dpr;
  const atlas = buildAtlas({ dpr, colors: COLORS });

  const base = blitRect(atlas, "movingEnemy");
  // "constructor" and "length" are the ones that bite: the colour rows live in
  // an Array, so a truthiness check on the index would hand those two the
  // Array constructor and the row count in place of a row -- and then a cell
  // that is not a cell. Only a range check keeps them off it.
  for (const bad of [
    -1, 0, TEAM_COLOR_CAP + 1, 99, 1.5, NaN, undefined, null, true,
    "no", "constructor", "length", {},
  ]) {
    const rect = blitRect(atlas, "movingEnemy", 5, undefined, bad);
    expect(rect.sx, String(bad)).toBe(base.sx);
    expect(rect.sy, String(bad)).toBe(base.sy);
    expect(rect.sw, String(bad)).toBe(size);
  }

  // A kind with no team form ignores a perfectly good index the same way.
  for (const kind of PLAIN_KINDS) {
    const plain = blitRect(atlas, kind);
    const coloured = blitRect(atlas, kind, 5, undefined, 5);
    expect(coloured.sx, kind).toBe(plain.sx);
    expect(coloured.sy, kind).toBe(0);
  }

  // Including the inherited property names a plain object would answer to: the
  // cell maps are null-prototype precisely so "toString" is an unknown kind and
  // not a function pretending to be a cell.
  for (const kind of ["toString", "constructor", "hasOwnProperty"]) {
    const rect = blitRect(atlas, kind, 5, undefined, 5);
    expect(rect.sw, kind).toBe(size);
    expect(rect.sy, kind).toBe(5 * size);
  }
});

test("an unknown kind falls back to the enemy cell in whatever colour it was given", () => {
  installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  // The enemy cell and the focal cell are the same disc, and the disc's team
  // row is one cell, so an unknown kind in team 4's colour is team 4's disc.
  const unknown = blitRect(atlas, "no-such-kind", 5, undefined, 4);
  const disc = blitRect(atlas, "focal", 5, undefined, 4);
  expect(unknown.sx).toBe(disc.sx);
  expect(unknown.sy).toBe(disc.sy);
  expect(blitRect(atlas, "enemy", 5, undefined, 4).sx).toBe(disc.sx);
});

// Requirement 1, at the point it actually matters. The focal team's green is
// the one colour on this map that means "me", so no generated team colour may
// be it, and no team row may be painted with it.
test("the focal colour never comes out of the team palette", () => {
  const { draws } = installAtlasEnv();
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });

  for (const row of teamPasses(draws)) {
    for (const form of TEAM_FORMS) {
      expect(row[form].colour.colour, form).not.toBe(COLORS.focal);
      expect(row[form].colour.colour, form).not.toBe(COLORS.enemy);
      expect(row[form].colour.colour, form).not.toBe(COLORS.dead);
    }
  }

  // --ok, the token colors.focal resolves from, is a green at ~143 degrees. No
  // generated hue may sit near it: "which green is mine" is not a question the
  // map is allowed to ask.
  for (let i = 1; i <= TEAM_COLORS; i += 1) {
    expect(hueGap(teamHue(i), CLAIMED_HUES.ok), `colour ${i}`).toBeGreaterThan(20);
  }

  // And the focal team's own marker still comes from the row that paints
  // colors.focal, whatever its team id happens to be.
  const focalCell = blitRect(atlas, "movingFocal", 5, undefined, teamColorIndex(9, 9));
  expect(focalCell.sy).toBe(0);
  expect(focalCell.sx).toBe(blitRect(atlas, "movingFocal").sx);
});
