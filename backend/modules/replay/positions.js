// Wire codec for one player's replay track.
//
// Positions dominate the replay payload, so they travel as parallel arrays
// instead of an array of objects: t/x/y are first-difference coded, which turns
// a steady walk into a run of small integers that gzip well. Health and the flag
// bitmask stay absolute.
//
// Coordinates are integer METRES and are never re-quantised here. The caller
// (getMatchReplay.js) has already put every location through readXY, which is
// Math.round(cm / 100) -- so the values arriving here are whole metres, the same
// unit as kills[].vx/vy. Bucketing them any coarser would both throw away real
// precision and desync the tracks from the kill markers drawn beside them.

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampHealth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function packFlags(sample) {
  // bit 0 in a vehicle, bit 1 knocked, bits 2-4 which vehicle (0-7). Car is
  // kind 0, so the low bit alone still reads as "in a car" for a sample that
  // names no vehicle.
  const kind = Number(sample.vehicleKind);
  const kindBits = Number.isInteger(kind) && kind > 0 && kind < 8 ? kind << 2 : 0;
  return (sample.isInVehicle ? 1 : 0) | (sample.isDBNO ? 2 : 0) | kindBits;
}

// Sorted by t ascending, with only the first sample of each t kept.
function normalize(samples) {
  const usable = [];
  for (const s of samples) {
    if (!s || typeof s !== "object") continue;
    const t = Number(s.t);
    if (!Number.isFinite(t)) continue;
    usable.push({ t, sample: s, order: usable.length });
  }
  usable.sort((a, b) => a.t - b.t || a.order - b.order);
  const out = [];
  for (const entry of usable) {
    if (out.length && out[out.length - 1].t === entry.t) continue;
    out.push(entry);
  }
  return out;
}

function encodePositions(samples) {
  const encoded = { t: [], x: [], y: [], h: [], f: [] };
  if (!Array.isArray(samples) || samples.length === 0) return encoded;

  let prevT = 0;
  let prevX = 0;
  let prevY = 0;

  for (const { t, sample } of normalize(samples)) {
    const x = toNumber(sample.x, 0);
    const y = toNumber(sample.y, 0);
    encoded.t.push(t - prevT);
    encoded.x.push(x - prevX);
    encoded.y.push(y - prevY);
    encoded.h.push(clampHealth(sample.health));
    encoded.f.push(packFlags(sample));
    prevT = t;
    prevX = x;
    prevY = y;
  }

  return encoded;
}

function decodePositions(encoded) {
  if (!encoded || typeof encoded !== "object") return [];
  const { t, x, y, h, f } = encoded;
  if (!Array.isArray(t) || t.length === 0) return [];

  const dx = Array.isArray(x) ? x : [];
  const dy = Array.isArray(y) ? y : [];
  const health = Array.isArray(h) ? h : [];
  const flags = Array.isArray(f) ? f : [];

  const out = [];
  let curT = 0;
  let curX = 0;
  let curY = 0;

  for (let i = 0; i < t.length; i += 1) {
    curT += toNumber(t[i], 0);
    curX += toNumber(dx[i], 0);
    curY += toNumber(dy[i], 0);
    out.push({
      t: curT,
      x: curX,
      y: curY,
      h: clampHealth(health[i]),
      f: toNumber(flags[i], 0) & 31,
    });
  }

  return out;
}

module.exports = { encodePositions, decodePositions };
