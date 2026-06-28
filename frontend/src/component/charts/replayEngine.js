export const interpolatePosition = (positions, t) => {
  if (!positions || positions.length === 0) return null;
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (t < first.t || t > last.t) return null;
  for (let i = 0; i < positions.length - 1; i += 1) {
    const a = positions[i];
    const b = positions[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return { x: last.x, y: last.y };
};

export const playersAt = (players, t) =>
  (players || [])
    .filter((p) => p.deathTime == null || t <= p.deathTime)
    .map((p) => {
      const pos = interpolatePosition(p.positions, t);
      if (!pos) return null;
      return { name: p.name, accountId: p.accountId, teamId: p.teamId, isFocal: p.isFocal, x: pos.x, y: pos.y };
    })
    .filter(Boolean);

export const activeKills = (kills, t, window = 3) =>
  (kills || [])
    .filter((k) => k.t <= t && k.t > t - window)
    .map((k) => ({ kx: k.kx, ky: k.ky, vx: k.vx, vy: k.vy, age: (t - k.t) / window }));

export const advanceClock = (t, dtMs, speed, duration) => {
  const next = t + (dtMs / 1000) * speed;
  if (next >= duration) return { t: duration, playing: false };
  return { t: next, playing: true };
};

export const zoneAt = (zones, t) => {
  if (!zones || zones.length === 0) return null;
  if (t <= zones[0].t) return zones[0];
  if (t >= zones[zones.length - 1].t) return zones[zones.length - 1];
  for (let i = 0; i < zones.length - 1; i += 1) {
    const a = zones[i];
    const b = zones[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      const lerp = (k) => a[k] + (b[k] - a[k]) * f;
      return { bx: lerp("bx"), by: lerp("by"), br: lerp("br"), wx: lerp("wx"), wy: lerp("wy"), wr: lerp("wr") };
    }
  }
  return zones[zones.length - 1];
};

export const rosterAt = (players, kills, t) => {
  const killCount = {};
  for (const k of kills || []) {
    if (k.killer && k.t <= t) killCount[k.killer] = (killCount[k.killer] || 0) + 1;
  }
  return (players || [])
    .map((p) => ({
      name: p.name,
      accountId: p.accountId,
      teamId: p.teamId,
      kills: killCount[p.name] || 0,
      alive: p.deathTime == null || t <= p.deathTime,
      isFocal: p.isFocal,
    }))
    .sort((a, b) => {
      if (a.isFocal !== b.isFocal) return a.isFocal ? -1 : 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return String(a.name).localeCompare(String(b.name));
    });
};
