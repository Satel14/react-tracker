// Every rendering DECISION for the replay overlays, as pure functions.
//
// The canvas layer above this file is untestable (jsdom has no canvas and no
// Path2D), so anything it decides for itself ships unpinned -- that is how a
// nominal 5 px marker once drew at 3.1 px. So the rule is: this module answers
// "what and where", the canvas code only translates the answer into ctx calls.
//
// Coordinates are whole METRES throughout, exactly as the payload ships them,
// and are never scaled here. Times are in-game seconds.
//
// Hot path: these run inside a requestAnimationFrame loop with up to 62 players
// and hundreds of shots, so the `out`-taking functions fill a caller-owned array
// and mutate the entry objects already in it rather than allocating per frame
// (the same discipline as pruneFlashes in replayEvents.js).

const asArray = (value) => (Array.isArray(value) ? value : []);

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

const optionsOf = (options) => (options && typeof options === "object" ? options : {});

const numberOption = (value, fallback) => (isNum(value) ? value : fallback);

// ------------------------------------------------------------- shot window

const SHOT_COLUMNS = ["t", "ax", "ay", "vx", "vy"];

// The payload ships shots column-packed, but decodeReplay (replayModel.js) hands
// the rest of the app the decoded array-of-objects shape, so both are accepted:
// a window that silently drew nothing would be exactly the class of bug this
// module exists to prevent.
const toColumns = (shots) => {
  const columns = { t: [], ax: [], ay: [], vx: [], vy: [] };
  if (Array.isArray(shots)) {
    for (const s of shots) {
      if (!s || typeof s !== "object") continue;
      for (const key of SHOT_COLUMNS) columns[key].push(s[key]);
    }
    return columns;
  }
  if (!shots || typeof shots !== "object") return columns;
  for (const key of SHOT_COLUMNS) columns[key] = asArray(shots[key]);
  return columns;
};

// First index whose time is strictly greater than t. No cursor is kept: the user
// drags a scrubber, so every call must be able to land anywhere, backwards
// included.
const upperBound = (times, t) => {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] > t) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

export const createShotWindow = (shots, options) => {
  const opts = optionsOf(options);
  const lifetime = Math.max(numberOption(opts.lifetimeSeconds, 1.5), 0) || 1.5;
  const cap = Math.max(Math.floor(numberOption(opts.cap, 80)), 0);

  const columns = toColumns(shots);
  const src = columns.t;
  // Compact once at build time: a shot with an unusable time or endpoint is
  // dropped here rather than drawn as a line to the map origin.
  const T = [];
  const AX = [];
  const AY = [];
  const VX = [];
  const VY = [];
  for (let i = 0; i < src.length; i += 1) {
    const t = src[i];
    const ax = columns.ax[i];
    const ay = columns.ay[i];
    const vx = columns.vx[i];
    const vy = columns.vy[i];
    if (!isNum(t) || !isNum(ax) || !isNum(ay) || !isNum(vx) || !isNum(vy)) continue;
    T.push(t);
    AX.push(ax);
    AY.push(ay);
    VX.push(vx);
    VY.push(vy);
  }

  const buffer = [];

  const activeAt = (t, out) => {
    const dest = Array.isArray(out) ? out : buffer;
    // A shot lives over [shot.t, shot.t + lifetime), i.e. shot.t in (t - lifetime, t].
    let from = upperBound(T, t - lifetime);
    const to = upperBound(T, t);
    if (to - from > cap) from = to - cap;

    let n = 0;
    for (let i = from; i < to; i += 1) {
      const age = (t - T[i]) / lifetime;
      const entry = dest[n];
      if (entry) {
        entry.ax = AX[i];
        entry.ay = AY[i];
        entry.vx = VX[i];
        entry.vy = VY[i];
        entry.age = age;
      } else {
        dest.push({ ax: AX[i], ay: AY[i], vx: VX[i], vy: VY[i], age });
      }
      n += 1;
    }
    dest.length = n;
    return dest;
  };

  return { activeAt };
};

// ------------------------------------------------------------------- flight

// Liang-Barsky, run on the INFINITE line through the two exit points rather than
// on the segment between them: those points are only where the first and last
// player jumped, so the corridor has to be extended to the map edges to read as
// a flight path.
export const flightSegment = (flight, mapMax) => {
  if (!flight || typeof flight !== "object" || Array.isArray(flight)) return null;
  if (!isNum(mapMax) || mapMax <= 0) return null;

  const { x1, y1, x2, y2 } = flight;
  if (!isNum(x1) || !isNum(y1) || !isNum(x2) || !isNum(y2)) return null;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return null;

  let sMin = -Infinity;
  let sMax = Infinity;
  const edges = [
    [-dx, x1],
    [dx, mapMax - x1],
    [-dy, y1],
    [dy, mapMax - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      // Parallel to this pair of edges: either wholly inside them or wholly out.
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > sMax) return null;
      if (r > sMin) sMin = r;
    } else {
      if (r < sMin) return null;
      if (r < sMax) sMax = r;
    }
  }
  if (!Number.isFinite(sMin) || !Number.isFinite(sMax) || sMin > sMax) return null;

  return {
    x1: x1 + sMin * dx,
    y1: y1 + sMin * dy,
    x2: x1 + sMax * dx,
    y2: y1 + sMax * dy,
  };
};

const fade = (t, fadeStart, fadeEnd) => {
  if (!isNum(t)) return 1;
  if (!(fadeEnd > fadeStart)) return t >= fadeEnd ? 0 : 1;
  if (t <= fadeStart) return 1;
  if (t >= fadeEnd) return 0;
  return 1 - (t - fadeStart) / (fadeEnd - fadeStart);
};

export const flightAlpha = (t, options) => {
  const opts = optionsOf(options);
  return fade(t, numberOption(opts.fadeStart, 90), numberOption(opts.fadeEnd, 120));
};

// Landings are an early-match read, so they linger longer than the flight line.
export const landingsAlpha = (t, options) => {
  const opts = optionsOf(options);
  return fade(t, numberOption(opts.fadeStart, 120), numberOption(opts.fadeEnd, 180));
};

// -------------------------------------------------------------- special zones

// Index of the last path point at or before t. Same reason as the shot window:
// no cursor, because the scrubber goes both ways.
const floorIndex = (path, t) => {
  let lo = 0;
  let hi = path.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (path[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
};

const writeZone = (dest, n, type, x, y, r) => {
  const entry = dest[n];
  if (entry) {
    entry.type = type;
    entry.x = x;
    entry.y = y;
    entry.r = r;
  } else {
    dest.push({ type, x, y, r });
  }
};

export const specialZonesAt = (specialZones, t, out) => {
  const dest = Array.isArray(out) ? out : [];
  let n = 0;
  if (!isNum(t)) {
    dest.length = 0;
    return dest;
  }

  for (const zone of asArray(specialZones)) {
    if (!zone || typeof zone !== "object") continue;
    if (!isNum(zone.t0) || !isNum(zone.t1)) continue;
    if (t < zone.t0 || t > zone.t1) continue;

    const path = asArray(zone.path);
    if (path.length === 0) continue;

    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last || !isNum(first.x) || !isNum(first.y)) continue;

    let x;
    let y;
    // Clamped at both ends -- a sandstorm that walked off the map because a
    // reading was extrapolated past its last sample would be worse than one
    // that parks on its final position.
    if (path.length === 1 || !isNum(first.t) || t <= first.t) {
      x = first.x;
      y = first.y;
    } else if (!isNum(last.t) || !isNum(last.x) || !isNum(last.y) || t >= last.t) {
      x = isNum(last.x) ? last.x : first.x;
      y = isNum(last.y) ? last.y : first.y;
    } else {
      const i = floorIndex(path, t);
      const a = path[i] || first;
      const b = path[i + 1] || last;
      if (!isNum(a.x) || !isNum(a.y) || !isNum(b.x) || !isNum(b.y) || !isNum(a.t) || !isNum(b.t)) continue;
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      x = a.x + (b.x - a.x) * f;
      y = a.y + (b.y - a.y) * f;
    }

    writeZone(dest, n, typeof zone.type === "string" ? zone.type : null, x, y, isNum(zone.r) ? zone.r : 0);
    n += 1;
  }

  dest.length = n;
  return dest;
};

// ------------------------------------------------------------------- health

// A threshold, not a gradient: the ring reads as one of three states, and a
// missing reading means "unhurt" rather than painting everyone as dying.
export const healthArc = (h) => {
  const value = isNum(h) ? h : 100;
  const fraction = Math.min(1, Math.max(0, value / 100));
  let level = "ok";
  if (value < 20) level = "danger";
  else if (value <= 50) level = "warn";
  return { fraction, level };
};

// ----------------------------------------------------------------- packages

export const packagesAt = (packages, t, out) => {
  const dest = Array.isArray(out) ? out : [];
  let n = 0;
  if (!isNum(t)) {
    dest.length = 0;
    return dest;
  }

  for (const pkg of asArray(packages)) {
    if (!pkg || typeof pkg !== "object") continue;
    const landT = pkg.t;
    if (!isNum(landT) || !isNum(pkg.x) || !isNum(pkg.y)) continue;
    // An unpaired land has no spawn, so the crate simply appears where it lands
    // and is never shown falling.
    const spawnT = isNum(pkg.ts) ? pkg.ts : landT;
    if (t < spawnT) continue;

    const falling = t < landT;
    const entry = dest[n];
    const kind = typeof pkg.kind === "string" ? pkg.kind : null;
    if (entry) {
      entry.kind = kind;
      entry.x = pkg.x;
      entry.y = pkg.y;
      entry.falling = falling;
    } else {
      dest.push({ kind, x: pkg.x, y: pkg.y, falling });
    }
    n += 1;
  }

  dest.length = n;
  return dest;
};
