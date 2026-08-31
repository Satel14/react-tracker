// Turns the map-marker PNGs in src/assets/markers into the SVG path data that
// ICON_PATHS in component/charts/replaySprites.js holds.
//
//   node scripts/traceMarkers.mjs
//
// Run it when a marker image is replaced, then paste the printed paths into
// replaySprites.js. It is deliberately not part of the build: the paths are
// source, reviewed like source, and the atlas stays synchronous because of it
// -- an image-based atlas would have to load and decode before it could paint,
// and every glyph would need its own tint and halo pass.
//
// The two decisions that matter, both learned the hard way:
//
//  * Threshold on LUMINANCE, not alpha. These icons are a light body with the
//    detail -- wheels, windows, eye sockets -- drawn into it in black. Mask on
//    alpha and all of it flattens into one blob; the first pass produced a car
//    nobody could name. Masked on luminance the dark linework falls outside
//    the mask and comes back as holes wound the other way, which a nonzero
//    fill punches out.
//  * Fit the ink to the box by its LONGER side. Forcing both sides would
//    stretch a car until it was as tall as it is wide.
//
// The art is PUBG's own map markers. src/assets/markers is not under public/
// and nothing imports it, so none of it reaches the bundle: it is kept as the
// provenance of the paths and so a re-trace does not need a re-download.

import fs from "node:fs";
import zlib from "node:zlib";

// --- minimal PNG decode (RGBA / greyscale+alpha, 8-bit) ---
function decode(file) {
  const b = fs.readFileSync(file);
  let i = 8, w, h, bd, ct; const idat = [];
  while (i < b.length) {
    const len = b.readUInt32BE(i), type = b.slice(i + 4, i + 8).toString();
    if (type === "IHDR") { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); bd = b[i + 16]; ct = b[i + 17]; }
    if (type === "IDAT") idat.push(b.slice(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = ch * (bd / 8), stride = w * bpp;
  const out = Buffer.alloc(h * stride); let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const line = raw.slice(p, p + stride); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const bb = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += bb; else if (f === 3) v += (a + bb) >> 1;
      else if (f === 4) { const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c); }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

// --- boundary trace: directed unit edges with the inside on the left ---
// Outer loops come out one winding and holes the other, which is exactly what
// a nonzero fill needs to punch the holes out.
function contours(mask, w, h) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  const edges = new Map();   // "x,y" -> [x2,y2]
  const put = (x1, y1, x2, y2) => {
    const k = `${x1},${y1}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push([x2, y2]);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) put(x, y, x + 1, y);
    if (!inside(x + 1, y)) put(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) put(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) put(x, y + 1, x, y);
  }
  const loops = [];
  for (const [start] of edges) {
    while (edges.get(start) && edges.get(start).length) {
      const loop = []; let cur = start;
      while (true) {
        const nexts = edges.get(cur);
        if (!nexts || !nexts.length) break;
        const [nx, ny] = nexts.shift();
        const [cx, cy] = cur.split(",").map(Number);
        loop.push([cx, cy]);
        cur = `${nx},${ny}`;
        if (cur === start) break;
      }
      if (loop.length > 2) loops.push(loop);
    }
  }
  return loops;
}

// Collinear points carry no shape and triple the path.
const simplify = (loop) => {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[(i - 1 + loop.length) % loop.length], c = loop[i], n = loop[(i + 1) % loop.length];
    const cross = (c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]);
    if (cross !== 0) out.push(c);
  }
  return out.length > 2 ? out : loop;
};

const round = (v) => Math.round(v * 100) / 100;

// A 500px source traces into six hundred points of pixel staircase. Box-filter
// it down to marker resolution first: the glyph is read at ten to twenty
// screen pixels, so detail below that is noise with a bundle cost.
// The shape that carries the meaning is not the alpha. These icons are a WHITE
// body with the detail -- wheels, windows, eye sockets -- drawn into it in
// black. Masking on alpha alone flattens all of that into one blob, which is
// how the first pass produced an unrecognisable car. Mask on "opaque AND
// light" instead: the dark linework then falls outside the mask and the
// tracer's own winding punches it out as holes.
function alphaGrid(im, maxDim) {
  const { w, h, ch } = im;
  const at = (x, y) => {
    const k = (y * w + x) * ch;
    const a = ch === 4 ? im.data[k + 3] : (ch === 2 ? im.data[k + 1] : 255);
    const lum = ch >= 3 ? (im.data[k] * 0.299 + im.data[k + 1] * 0.587 + im.data[k + 2] * 0.114) : im.data[k];
    // Premultiplied by coverage so a half-covered white edge reads as half.
    return (a / 255) * lum;
  };
  if (Math.max(w, h) <= maxDim) {
    const a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = at(x, y);
    return { w, h, a };
  }
  const f = Math.ceil(Math.max(w, h) / maxDim);
  const nw = Math.ceil(w / f), nh = Math.ceil(h / f);
  const a = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let sum = 0, n = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const sx = x * f + dx, sy = y * f + dy;
      if (sx < w && sy < h) { sum += at(sx, sy); n++; }
    }
    a[y * nw + x] = n ? Math.round(sum / n) : 0;
  }
  return { w: nw, h: nh, a };
}

export function trace(file, { box = 28, inset = 2, threshold = 128, maxDim = 40 } = {}) {
  const src = decode(file);
  const { w, h, a: alpha } = alphaGrid(src, maxDim);
  const mask = new Uint8Array(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let k = 0; k < w * h; k++) {
    if (alpha[k] >= threshold) {
      mask[k] = 1;
      const x = k % w, y = (k / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  // Fit the ink to the design box, preserving aspect and centring -- the same
  // inscription rule every drawn glyph in the atlas follows.
  const iw = maxX - minX + 1, ih = maxY - minY + 1;
  const s = box / Math.max(iw, ih);
  const ox = inset + (box - iw * s) / 2, oy = inset + (box - ih * s) / 2;
  const map = ([x, y]) => [round((x - minX) * s + ox), round((y - minY) * s + oy)];
  const loops = contours(mask, w, h).map(simplify).map((l) => l.map(map));
  loops.sort((a, b) => b.length - a.length);
  return {
    d: loops.map((l) => "M" + l.map(([x, y]) => `${x} ${y}`).join(" L") + " Z").join(" "),
    loops: loops.length,
    points: loops.reduce((n, l) => n + l.length, 0),
    ink: mask.reduce((n, v) => n + v, 0) / (w * h),
  };
}

const SRC = new URL("../src/assets/markers/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
for (const [name, file] of Object.entries({ CAR: "wheeled", BIKE: "motorbike", BOAT: "boat", PLANE: "plane", DEAD: "dead" })) {
  const r = trace(SRC + file + ".png");
  console.log(`${name.padEnd(6)} loops=${String(r.loops).padStart(2)} points=${String(r.points).padStart(4)} ink=${r.ink.toFixed(3)} chars=${r.d.length}`);
}
