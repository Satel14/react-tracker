export const STATE = { ABSENT: 0, ALIVE: 1, DEAD: 2 };

export const buildTracks = (players = []) => {
  const list = Array.isArray(players) ? players : [];
  const count = list.length;
  const tracks = {
    count,
    meta: new Array(count),
    T: new Array(count),
    X: new Array(count),
    Y: new Array(count),
    cursor: new Int32Array(count),
    outX: new Float32Array(count),
    outY: new Float32Array(count),
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
    for (let j = 0; j < n; j += 1) {
      T[j] = pos[j].t;
      X[j] = pos[j].x;
      Y[j] = pos[j].y;
    }
    tracks.T[i] = T;
    tracks.X[i] = X;
    tracks.Y[i] = Y;
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
    if (st <= T[0]) {
      tracks.outX[i] = X[0];
      tracks.outY[i] = Y[0];
    } else if (st >= T[n - 1]) {
      tracks.outX[i] = X[n - 1];
      tracks.outY[i] = Y[n - 1];
    } else {
      const span = T[c + 1] - T[c] || 1;
      const f = (st - T[c]) / span;
      tracks.outX[i] = X[c] + (X[c + 1] - X[c]) * f;
      tracks.outY[i] = Y[c] + (Y[c + 1] - Y[c]) * f;
    }

    tracks.outState[i] =
      meta.deathTime !== null && t > meta.deathTime ? STATE.DEAD : STATE.ALIVE;
  }
  tracks.lastT = t;
  return tracks;
};
