import { buildAtlas, ICON_PATHS } from "./replaySprites";

const COLORS = { focal: "rgb(1,1,1)", enemy: "rgb(2,2,2)", dead: "rgb(3,3,3)" };

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

test("exposes a path string per icon kind", () => {
  expect(Object.keys(ICON_PATHS).sort()).toEqual(["dead", "enemy", "focal"]);
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
  // jsdom defines neither Path2D nor a 2D context.
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  expect(atlas).toBeNull();
});
