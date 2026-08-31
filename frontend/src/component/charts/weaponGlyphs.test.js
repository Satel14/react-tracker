import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WEAPON_GLYPHS, GLYPH_BOX } from "./weaponGlyphs";

const here = dirname(fileURLToPath(import.meta.url));

// The backend picks which silhouette a kill draws; this file holds the
// drawings. Read as source rather than imported because that module is
// CommonJS living outside the Vite root -- the same reason
// navigationTargets.test.js scans source instead of executing it.
const backendKinds = () => {
  const src = readFileSync(resolve(here, "../../../../backend/modules/replay/weaponIcon.js"), "utf8");
  const block = src.match(/ICON_KINDS = Object\.freeze\(\[([^\]]*)\]/);
  if (!block) throw new Error("ICON_KINDS not found in backend/modules/replay/weaponIcon.js");
  return (block[1].match(/"([^"]+)"/g) || []).map((q) => q.slice(1, -1));
};

// A fill-only rasteriser. Deliberately NOT shared with replaySprites.test.js:
// that one measures stroked glyphs inscribed in the atlas's 32-unit cell and
// is wired to the paint passes the atlas actually ran. These are filled SVG on
// their own box, and coupling the two suites to make one copy of forty lines
// of geometry would be the worse trade.
const pathPoints = (d) => {
  const tokens = d.match(/[MLZ]|-?\d*\.?\d+/g) || [];
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  const subpaths = [];
  let current = [];
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      current = [];
      subpaths.push(current);
      current.push([next(), next()]);
    } else if (cmd === "L") {
      current.push([next(), next()]);
    }
  }
  return subpaths;
};

// Nonzero winding, the rule an SVG <path> fills with by default.
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

// Sampled at the size the feed actually draws these -- a couple of hundred
// cells, not a thousand -- so the measurement is about what a reader can see.
const COLS = 80;
const ROWS = 32;

const maskOf = (d) => {
  const subpaths = pathPoints(d);
  const mask = new Uint8Array(COLS * ROWS);
  for (let gy = 0; gy < ROWS; gy += 1) {
    const py = ((gy + 0.5) * GLYPH_BOX.h) / ROWS;
    for (let gx = 0; gx < COLS; gx += 1) {
      const px = ((gx + 0.5) * GLYPH_BOX.w) / COLS;
      if (windingAt(subpaths, px, py) !== 0) mask[gy * COLS + gx] = 1;
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

// Two silhouettes this alike are one silhouette drawn twice. The same measure
// the map markers are held to, and the same ceiling: these are read bigger,
// but there are twelve of them and they are all guns.
//
// It binds. The worst pair is ar/lmg at 0.634 -- both are a barrel over a
// receiver over a stock, and only the bipod and the box magazine separate
// them. Raising this number to make a change fit would be turning the guard
// off; redraw the glyph instead.
const OVERLAP_CEILING = 0.65;

describe("weapon glyphs", () => {
  it("draws exactly the kinds the backend classifier can return", () => {
    expect(Object.keys(WEAPON_GLYPHS).sort()).toEqual(backendKinds().sort());
  });

  it("keeps every glyph inside its own box", () => {
    for (const [kind, d] of Object.entries(WEAPON_GLYPHS)) {
      const points = pathPoints(d).flat();
      expect(points.length, kind).toBeGreaterThan(2);
      for (const [x, y] of points) {
        expect(x, `${kind} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${kind} x`).toBeLessThanOrEqual(GLYPH_BOX.w);
        expect(y, `${kind} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${kind} y`).toBeLessThanOrEqual(GLYPH_BOX.h);
      }
    }
  });

  it("gives every glyph enough ink to read and not so much it is a blob", () => {
    for (const [kind, d] of Object.entries(WEAPON_GLYPHS)) {
      const share = inkOf(maskOf(d)) / (COLS * ROWS);
      expect(share, `${kind} is too faint`).toBeGreaterThan(0.05);
      expect(share, `${kind} is a blob`).toBeLessThan(0.6);
    }
  });

  it("keeps no two silhouettes from collapsing into each other", () => {
    const kinds = Object.keys(WEAPON_GLYPHS);
    const masks = Object.fromEntries(kinds.map((k) => [k, maskOf(WEAPON_GLYPHS[k])]));
    const tooAlike = [];
    for (let i = 0; i < kinds.length; i += 1) {
      for (let j = i + 1; j < kinds.length; j += 1) {
        const overlap = overlapOf(masks[kinds[i]], masks[kinds[j]]);
        if (overlap > OVERLAP_CEILING) {
          tooAlike.push(`${kinds[i]}/${kinds[j]} ${overlap.toFixed(3)}`);
        }
      }
    }
    expect(tooAlike).toEqual([]);
  });
});
