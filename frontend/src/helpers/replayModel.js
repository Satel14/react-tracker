// Wire decoder for the replay payload (format 2).
//
// The backend ships positions and shots column-wise: parallel arrays instead of
// arrays of objects, with t/x/y first-difference coded so a steady walk becomes
// a run of small integers that gzip well. This module is the only place that
// undoes that, handing the rest of the frontend the object shape it already
// reads (see buildTracks in replayTracks.js, which pulls .t/.x/.y off samples).
//
// Coordinates arrive as whole metres and are never rescaled here -- the same
// unit as kills[].vx/vy, so tracks and markers stay in one map space.
//
// It must never throw: a stale cached payload from before the compaction has to
// render, not blank the page.

const SHOT_KEYS = ["t", "a", "v", "ax", "ay", "vx", "vy", "dmg"];

const asArray = (value) => (Array.isArray(value) ? value : []);

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampHealth = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
};

// Legacy tracks are [{t, x, y}]; health and flags did not exist yet, so they
// take the values that mean "untouched and on foot".
const decodeLegacyPositions = (samples) => {
  const out = [];
  for (const s of asArray(samples)) {
    if (!s || typeof s !== "object") continue;
    out.push({
      t: toNumber(s.t, 0),
      x: toNumber(s.x, 0),
      y: toNumber(s.y, 0),
      h: clampHealth(s.h ?? 100),
      f: toNumber(s.f, 0) & 15,
    });
  }
  return out;
};

const decodeColumnPositions = (encoded) => {
  const t = asArray(encoded.t);
  if (t.length === 0) return [];
  const dx = asArray(encoded.x);
  const dy = asArray(encoded.y);
  const health = asArray(encoded.h);
  const flags = asArray(encoded.f);

  const out = [];
  let curT = 0;
  let curX = 0;
  let curY = 0;
  for (let i = 0; i < t.length; i += 1) {
    curT += toNumber(t[i], 0);
    curX += toNumber(dx[i], 0);
    curY += toNumber(dy[i], 0);
    // & 15 mirrors decodePositions in backend/modules/replay/positions.js; the two
    // codecs are inverses and must not fork, so admitting a third flag bit here
    // means widening the mask in both files together.
    const f = toNumber(flags[i], 0) & 15;
    out.push({ t: curT, x: curX, y: curY, h: clampHealth(health[i]), f });
  }
  return out;
};

// Shape, not the format flag, decides: an Array is always the legacy track, an
// object of arrays always the columnar one, and the two can never be confused.
const decodePositions = (positions) => {
  if (Array.isArray(positions)) return decodeLegacyPositions(positions);
  if (!positions || typeof positions !== "object") return [];
  return decodeColumnPositions(positions);
};

const decodePlayers = (players) =>
  asArray(players).map((p) => {
    const player = p && typeof p === "object" ? p : {};
    return { ...player, positions: decodePositions(player.positions) };
  });

const decodeShots = (shots) => {
  // A payload old enough to predate the compaction may already hold objects.
  if (Array.isArray(shots)) return shots;
  if (!shots || typeof shots !== "object") return [];

  const columns = SHOT_KEYS.map((key) => asArray(shots[key]));
  const n = columns.reduce((min, col) => Math.min(min, col.length), Infinity);
  const count = Number.isFinite(n) ? n : 0;

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const shot = {};
    for (let k = 0; k < SHOT_KEYS.length; k += 1) shot[SHOT_KEYS[k]] = columns[k][i];
    out.push(shot);
  }
  return out;
};

export const decodeReplay = (payload) => {
  const src = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return {
    ...src,
    players: decodePlayers(src.players),
    shots: decodeShots(src.shots),
    kills: asArray(src.kills),
    zones: asArray(src.zones),
    landings: asArray(src.landings),
    knocks: asArray(src.knocks),
    revives: asArray(src.revives),
    packages: asArray(src.packages),
    specialZones: asArray(src.specialZones),
    phases: asArray(src.phases),
    flight: src.flight ?? null,
  };
};

export default decodeReplay;
