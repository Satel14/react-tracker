export const STATE = { ABSENT: 0, ALIVE: 1, DEAD: 2 };

// Metres covered across one 10 s sample gap before a player counts as moving.
// Walking is ~20-40 m over that window, so this only rejects standing still
// and the jitter of a player holding position.
const MOVING_METRES = 5;

export const buildTracks = (players = []) => {
  const list = Array.isArray(players) ? players : [];
  const count = list.length;
  const tracks = {
    count,
    meta: new Array(count),
    T: new Array(count),
    X: new Array(count),
    Y: new Array(count),
    A: new Array(count),
    H: new Array(count),
    F: new Array(count),
    cursor: new Int32Array(count),
    outX: new Float32Array(count),
    outY: new Float32Array(count),
    outH: new Uint8Array(count),
    outF: new Uint8Array(count),
    outAngle: new Float32Array(count),
    outMoving: new Uint8Array(count),
    outState: new Uint8Array(count),
    lastT: -Infinity,
  };
  for (let i = 0; i < count; i += 1) {
    const p = list[i];
    const pos = Array.isArray(p.positions) ? p.positions : [];
    const n = pos.length;
    const T = new Float32Array(n);
    const X = new Float32Array(n);
    const Y = new Float32Array(n);
    const H = new Uint8Array(n);
    const F = new Uint8Array(n);
    for (let j = 0; j < n; j += 1) {
      T[j] = pos[j].t;
      X[j] = pos[j].x;
      Y[j] = pos[j].y;
      // A legacy payload carries neither, so an absent reading means "unhurt,
      // on foot" rather than zero health and no flags.
      H[j] = typeof pos[j].h === "number" ? pos[j].h : 100;
      F[j] = typeof pos[j].f === "number" ? pos[j].f : 0;
    }
    // Bearing per segment, resolved once. A segment where the player did not
    // move inherits the last one that they did, so a parked marker keeps a
    // real heading -- and keeps it whether you scrubbed straight here or
    // played through, which is the same cursor-free property the rest of this
    // file is built on.
    const A = new Float32Array(Math.max(0, n - 1));
    let lastAngle = 0;
    for (let j = 0; j < n - 1; j += 1) {
      const dx = X[j + 1] - X[j];
      const dy = Y[j + 1] - Y[j];
      if (dx !== 0 || dy !== 0) lastAngle = Math.atan2(dy, dx);
      A[j] = lastAngle;
    }
    tracks.T[i] = T;
    tracks.X[i] = X;
    tracks.Y[i] = Y;
    tracks.A[i] = A;
    tracks.H[i] = H;
    tracks.F[i] = F;
    tracks.meta[i] = {
      name: p.name,
      accountId: p.accountId,
      teamId: p.teamId ?? null,
      isFocal: !!p.isFocal,
      dropTime: p.dropTime ?? null,
      deathTime: p.deathTime ?? null,
    };
  }
  return tracks;
};

const seekCursor = (T, from, t) => {
  const n = T.length;
  let i = from;
  if (i < 0) i = 0;
  if (i > n - 2) i = Math.max(0, n - 2);
  while (i < n - 2 && T[i + 1] < t) i += 1;
  while (i > 0 && T[i] > t) i -= 1;
  return i;
};

export const sampleTracks = (tracks, t) => {
  const backward = t < tracks.lastT;
  for (let i = 0; i < tracks.count; i += 1) {
    const T = tracks.T[i];
    const n = T.length;
    const meta = tracks.meta[i];

    if (n === 0) {
      tracks.outState[i] = STATE.ABSENT;
      continue;
    }
    if (meta.dropTime !== null && t < meta.dropTime) {
      tracks.outState[i] = STATE.ABSENT;
      continue;
    }

    const st = meta.deathTime !== null && t > meta.deathTime ? meta.deathTime : t;

    const start = backward ? 0 : tracks.cursor[i];
    const c = seekCursor(T, start, st);
    tracks.cursor[i] = c;

    const X = tracks.X[i];
    const Y = tracks.Y[i];
    // Position lerps; health and the flag mask step-hold. A 10 s health
    // snapshot interpolated would report readings the telemetry never made,
    // and nobody is ever half in a vehicle.
    let held = 0;
    if (st <= T[0]) {
      tracks.outX[i] = X[0];
      tracks.outY[i] = Y[0];
      held = 0;
    } else if (st >= T[n - 1]) {
      tracks.outX[i] = X[n - 1];
      tracks.outY[i] = Y[n - 1];
      held = n - 1;
    } else {
      const span = T[c + 1] - T[c] || 1;
      const f = (st - T[c]) / span;
      tracks.outX[i] = X[c] + (X[c + 1] - X[c]) * f;
      tracks.outY[i] = Y[c] + (Y[c + 1] - Y[c]) * f;
      held = st >= T[c + 1] ? c + 1 : c;
    }
    tracks.outH[i] = tracks.H[i][held];
    tracks.outF[i] = tracks.F[i][held];

    // Heading is the direction of the segment being crossed. Samples are 10 s
    // apart, so this is a real bearing over that window rather than a facing
    // angle -- telemetry carries no rotation at all.
    if (n >= 2) {
      const seg = Math.min(Math.max(c, 0), n - 2);
      tracks.outAngle[i] = tracks.A[i][seg];
      const dx = X[seg + 1] - X[seg];
      const dy = Y[seg + 1] - Y[seg];
      tracks.outMoving[i] = Math.hypot(dx, dy) >= MOVING_METRES ? 1 : 0;
    } else {
      tracks.outMoving[i] = 0;
    }

    tracks.outState[i] =
      meta.deathTime !== null && t > meta.deathTime ? STATE.DEAD : STATE.ALIVE;
  }
  tracks.lastT = t;
  return tracks;
};
