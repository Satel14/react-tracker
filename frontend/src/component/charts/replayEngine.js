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

// Index of the last sample at or before t, or -1 when t precedes the track.
// Binary search, not a cursor: the scrubber jumps both ways and rosterAt is
// called with the throttled display time, so there is no monotonic playhead
// to walk.
const heldIndex = (positions, t) => {
  let lo = 0;
  let hi = positions.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (positions[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
};

// Health and the flag mask step-hold. A 10 s health snapshot interpolated
// would report a reading the telemetry never made.
const heldSample = (positions, t) => {
  const list = Array.isArray(positions) ? positions : [];
  const i = list.length === 0 ? -1 : heldIndex(list, t);
  if (i < 0) return { h: 100, f: 0 };
  const sample = list[i];
  // A legacy payload carries neither, so an absent reading means "unhurt, on
  // foot" rather than zero health and no flags.
  return {
    h: typeof sample.h === "number" ? sample.h : 100,
    f: typeof sample.f === "number" ? sample.f : 0,
  };
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
    .map((p) => {
      const alive = p.deathTime == null || t <= p.deathTime;
      const { h, f } = heldSample(p.positions, t);
      return {
        name: p.name,
        accountId: p.accountId,
        teamId: p.teamId,
        kills: killCount[p.accountId] ?? killCount[p.name] ?? 0,
        alive,
        isFocal: p.isFocal,
        h,
        // Bit 1 is the vehicle flag, bit 2 is knocked. A dead player is not
        // knocked -- they are past being revived.
        knocked: alive && (f & 2) !== 0,
      };
    })
    .sort((a, b) => {
      if (a.isFocal !== b.isFocal) return a.isFocal ? -1 : 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return String(a.name).localeCompare(String(b.name));
    });
};

const compareTeamId = (a, b) => {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

// Collapse roster rows into team cards: focal team first, then teams with
// survivors before wiped ones, then team id ascending. Inside a team, the
// living are listed before the fallen, then by kills, then by name.
export const groupRosterIntoTeams = (rows = []) => {
  const teams = [];
  const indexByTeam = new Map();
  for (const row of rows) {
    const teamId = row.teamId ?? null;
    const key = teamId === null ? "none" : String(teamId);
    if (!indexByTeam.has(key)) {
      indexByTeam.set(key, teams.length);
      teams.push({ key, teamId, members: [], aliveCount: 0, total: 0, isFocal: false });
    }
    const team = teams[indexByTeam.get(key)];
    team.members.push(row);
    team.total += 1;
    if (row.alive) team.aliveCount += 1;
    if (row.isFocal) team.isFocal = true;
  }
  for (const team of teams) {
    team.members.sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return String(a.name).localeCompare(String(b.name));
    });
  }
  return teams.sort((a, b) => {
    if (a.isFocal !== b.isFocal) return a.isFocal ? -1 : 1;
    const aLives = a.aliveCount > 0;
    const bLives = b.aliveCount > 0;
    if (aLives !== bLives) return aLives ? -1 : 1;
    return compareTeamId(a.teamId, b.teamId);
  });
};
