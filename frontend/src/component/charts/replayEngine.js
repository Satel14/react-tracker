export const advanceClock = (t, dtMs, speed, duration) => {
  const next = t + (dtMs / 1000) * speed;
  if (next >= duration) return { t: duration, playing: false };
  return { t: next, playing: true };
};

export const zoneAt = (zones, t) => {
  if (!zones || zones.length === 0) return null;
  if (t < zones[0].t) return null;
  const last = zones[zones.length - 1];
  if (t >= last.t) return last;
  for (let i = 0; i < zones.length - 1; i += 1) {
    const a = zones[i];
    const b = zones[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      const lerp = (k) => a[k] + (b[k] - a[k]) * f;
      return {
        bx: lerp("bx"),
        by: lerp("by"),
        br: lerp("br"),
        wx: a.wx,
        wy: a.wy,
        wr: a.wr,
        phase: a.phase ?? 0,
      };
    }
  }
  return last;
};

export const rosterAt = (players, kills, t) => {
  // Credit by accountId when the payload carries it -- two players can share a
  // display name in one lobby. The name is kept as the fallback so a payload
  // predating killerAccountId still counts, and Object.create(null) still
  // matters there: a player called __proto__ would otherwise never be credited.
  const killCount = Object.create(null);
  for (const k of kills || []) {
    const key = k.killerAccountId || k.killer;
    if (key && k.t <= t) killCount[key] = (killCount[key] || 0) + 1;
  }
  return (players || [])
    .map((p) => ({
      name: p.name,
      accountId: p.accountId,
      teamId: p.teamId,
      kills: killCount[p.accountId] ?? killCount[p.name] ?? 0,
      alive: p.deathTime == null || t <= p.deathTime,
      isFocal: p.isFocal,
    }))
    .sort((a, b) => {
      if (a.isFocal !== b.isFocal) return a.isFocal ? -1 : 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return String(a.name).localeCompare(String(b.name));
    });
};
