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
      return { name: p.name, teamId: p.teamId, isFocal: p.isFocal, x: pos.x, y: pos.y };
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
