// Turns a run of one-minute observations into the two numbers the attribution
// rule cannot be written without: whether PUBG counts a ranked match at the
// player's death or at the match's end, and how long after that moment the
// ranked counter actually moves.
//
// Pure on purpose. The poller writes JSONL; this reads it back and is the only
// part that has to be right.

const toTime = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const seconds = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0;
};

function prepare(matches) {
  return matches
    .filter((m) => m?.matchType === "competitive")
    .map((m) => {
      const createdAt = toTime(m.createdAt);
      return {
        id: m.id,
        createdAt,
        endedAt: createdAt === null ? null : createdAt + seconds(m.duration),
        diedAt: createdAt === null ? null : createdAt + seconds(m.timeSurvived),
        deathType: m.deathType ?? null,
        countedAt: null,
        ambiguous: false,
        firstListedAt: null,
      };
    })
    .filter((m) => m.createdAt !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// A counter that moves by one names its match: the oldest ranked match already
// under way that no earlier poll has accounted for. A jump of more than one
// leaves the order inside that gap unknown, so those matches carry only an
// upper bound and are reported as such rather than averaged in.
function assignCounts(polls, tracked) {
  let previous = null;
  for (const poll of polls) {
    const rounds = Number(poll.roundsPlayed);
    if (!Number.isFinite(rounds)) continue;

    const ids = Array.isArray(poll.matchIds) ? poll.matchIds : [];
    for (const match of tracked) {
      if (match.firstListedAt === null && ids.includes(match.id)) match.firstListedAt = poll.at;
    }

    if (previous !== null && rounds > previous) {
      const gained = rounds - previous;
      const candidates = tracked.filter((m) => m.countedAt === null && m.createdAt <= poll.at).slice(0, gained);
      for (const match of candidates) {
        match.countedAt = poll.at;
        match.ambiguous = gained > 1;
      }
    }
    previous = rounds;
  }
}

function describe(match, watchedFrom) {
  const counted = match.countedAt !== null;
  // A match already over when watching began was absorbed by the counter before
  // the first reading, so its silence is an artefact of the window, not a fact
  // about PUBG.
  const outOfRange = !counted && watchedFrom !== null && match.endedAt < watchedFrom;
  return {
    id: match.id,
    outOfRange,
    createdAt: match.createdAt,
    endedAt: match.endedAt,
    diedAt: match.diedAt,
    deathType: match.deathType,
    firstListedAt: match.firstListedAt,
    listed: match.firstListedAt !== null,
    countedAt: match.countedAt,
    ambiguous: match.ambiguous,
    lagFromEndMs: counted ? match.countedAt - match.endedAt : null,
    lagFromDeathMs: counted ? match.countedAt - match.diedAt : null,
    countedBeforeMatchEnd: counted ? match.countedAt < match.endedAt : null,
    listedBeforeCounted: counted && match.firstListedAt !== null ? match.firstListedAt <= match.countedAt : null,
  };
}

function summarise(rows) {
  const counted = rows.filter((r) => r.countedAt !== null);
  const firm = counted.filter((r) => !r.ambiguous);
  const before = firm.filter((r) => r.countedBeforeMatchEnd).length;
  const lags = firm.map((r) => r.lagFromEndMs).sort((a, b) => a - b);
  const at = (fraction) => (lags.length ? lags[Math.min(lags.length - 1, Math.floor(fraction * lags.length))] : null);
  return {
    matches: rows.length,
    counted: counted.length,
    ambiguous: counted.filter((r) => r.ambiguous).length,
    outOfRange: rows.filter((r) => r.outOfRange).length,
    uncounted: rows.filter((r) => r.countedAt === null && !r.outOfRange).length,
    firm: firm.length,
    // One match counted before it ended settles it: PUBG cannot be waiting for
    // the match to finish. With nothing firm to go on, say nothing.
    countsAt: firm.length === 0 ? null : before > 0 ? "playerDeath" : "matchEnd",
    countedBeforeMatchEnd: before,
    listedBeforeCounted: firm.filter((r) => r.listedBeforeCounted === true).length,
    minLagFromEndMs: lags.length ? lags[0] : null,
    medianLagFromEndMs: at(0.5),
    maxLagFromEndMs: lags.length ? lags[lags.length - 1] : null,
  };
}

function analyseLag({ polls = [], matches = [] } = {}) {
  const ordered = [...polls].filter((p) => Number.isFinite(Number(p?.at))).sort((a, b) => a.at - b.at);
  const tracked = prepare(matches);
  assignCounts(ordered, tracked);
  const watchedFrom = ordered.length ? ordered[0].at : null;
  const rows = tracked.map((match) => describe(match, watchedFrom));
  return { matches: rows, summary: summarise(rows), polls: ordered.length };
}

module.exports = { analyseLag };
