// The replay's kill feed: the lines the game writes in the top corner, rebuilt
// from the payload.
//
// Two functions rather than one, and for the same reason replayLayers.js splits
// createShotWindow from packagesAt. Merging the two event streams and resolving
// every account id is work that depends only on the payload, so it happens once
// and is memoised; picking the lines to show depends on the playhead and
// happens sixty times a second.
//
// feedAt is a function of t and holds no cursor, which is the whole point: the
// viewer scrubs, and a swept cursor would have to notice it went backwards and
// reset. This cannot be wrong about that because it has nothing to reset. The
// same reasoning is why phaseAt in ReplayOverlays.jsx scans rather than sweeps.

export const FEED = Object.freeze({
  // Seconds a line stays up. The game's is around five; this is a little longer
  // because a replay viewer is reading the map at the same time and has not
  // just heard the shot.
  window: 8,
  // Lines at once. A late-game squad wipe puts four names up in under two
  // seconds, and a fifth line is already past the corner of the map worth
  // watching.
  cap: 5,
});

const asArray = (value) => (Array.isArray(value) ? value : []);

// Telemetry's own word for the hit region. Read here so the view never has
// to know the vocabulary -- it is handed a boolean and draws a mark.
const HEADSHOT = "HeadShot";

// A kill record carries its own names; a knock carries account ids and nothing
// else. Both are resolved through the roster, and whichever the record has
// itself wins -- a player who left before LogMatchStart was recorded is in the
// kill and not in the roster, and that line still has to read.
const sideOf = (roster, accountId, name, teamId) => {
  const known = accountId ? roster.get(accountId) : null;
  const label = name || known?.name || null;
  if (!label) return null;
  return {
    name: label,
    teamId: teamId ?? known?.teamId ?? null,
    isFocal: !!known?.isFocal,
  };
};

export const buildFeedEvents = (kills, knocks, players) => {
  const roster = new Map();
  for (const p of asArray(players)) {
    if (p && typeof p.accountId === "string" && p.accountId) roster.set(p.accountId, p);
  }

  const events = [];

  for (const k of asArray(kills)) {
    if (!k) continue;
    const victim = sideOf(roster, k.victimAccountId, k.victim, k.victimTeamId);
    // No name for the victim is no line at all: a feed entry that says somebody
    // killed nobody is worse than a feed entry that is not there.
    if (!victim) continue;
    events.push({
      id: `kill:${k.t}:${k.victimAccountId || victim.name}`,
      t: k.t,
      kind: "kill",
      killer: sideOf(roster, k.killerAccountId, k.killer, k.killerTeamId),
      victim,
      weapon: k.w ?? null,
      icon: k.wi ?? null,
      headshot: k.r === HEADSHOT,
      dist: Number.isFinite(k.dist) ? k.dist : null,
    });
  }

  for (const n of asArray(knocks)) {
    if (!n) continue;
    const victim = sideOf(roster, n.v, null, null);
    if (!victim) continue;
    events.push({
      // dBNOId is per knock and repeats across a match, so the time goes in too.
      id: `knock:${n.id ?? "x"}:${n.t}:${n.v}`,
      t: n.t,
      kind: "knock",
      killer: sideOf(roster, n.a, null, null),
      victim,
      weapon: n.w ?? null,
      icon: n.wi ?? null,
      headshot: n.r === HEADSHOT,
      dist: Number.isFinite(n.dist) ? n.dist : null,
    });
  }

  events.sort((a, b) => a.t - b.t);
  return events;
};

export const feedAt = (events, t, options = {}) => {
  const list = asArray(events);
  const now = Number.isFinite(t) ? t : 0;
  const window = Number.isFinite(options.window) ? options.window : FEED.window;
  const cap = Number.isFinite(options.cap) ? options.cap : FEED.cap;

  // Walked from the newest end: the first lines found are the ones shown, and
  // the scan stops at the first one too old rather than filtering the match.
  const out = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (!event) continue;
    if (event.t > now) continue;
    if (now - event.t > window) break;
    out.push(event);
    if (out.length >= cap) break;
  }
  return out;
};

export default feedAt;
