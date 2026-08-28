function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Since Season 36 RP is one value repeated under every mode key. If the keys
// ever disagree we store null and attribution refuses to guess.
function readRankedSnapshot(rankedGameModeStats, rankedInfo = null) {
  const entries = Object.entries(rankedGameModeStats || {});
  if (!entries.length) return null;

  const modes = {};
  let roundsPlayed = 0;

  entries.forEach(([mode, stats]) => {
    const rankPoint = toNumberOrNull(stats?.currentRankPoint);
    const rounds = Number(stats?.roundsPlayed) || 0;
    const tier = typeof stats?.currentTier?.tier === "string" ? stats.currentTier.tier : null;
    modes[mode] = { rankPoint, roundsPlayed: rounds, tier };
    roundsPlayed += rounds;
  });

  // A mode with no rounds can't have contributed RP, so a zero-round shell entry
  // shouldn't be enough to null out an otherwise-agreeing reading; but if every
  // mode is a shell, fall back to all of them so we still read something.
  const playedValues = Object.values(modes).filter((m) => m.roundsPlayed > 0 && m.rankPoint !== null);
  const fallbackValues = Object.values(modes).filter((m) => m.rankPoint !== null);
  const distinct = new Set((playedValues.length ? playedValues : fallbackValues).map((m) => m.rankPoint));

  if (distinct.size > 1) {
    console.log(`[RP] Mode RP values disagree for a reading: ${[...distinct].join(", ")}`);
  }

  return {
    rankPoint: distinct.size === 1 ? [...distinct][0] : null,
    roundsPlayed,
    tier: typeof rankedInfo?.tier === "string" ? rankedInfo.tier : null,
    modes,
  };
}

function sameValues(a, b) {
  return a.rankPoint === b.rankPoint && a.roundsPlayed === b.roundsPlayed;
}

// Mirrors pgStore.recordReading in memory so attribution can run before the write lands.
function applyReading(series, reading, now) {
  const list = Array.isArray(series) ? series : [];
  const last = list[list.length - 1];
  if (last && sameValues(last, reading)) {
    return [...list.slice(0, -1), { ...last, lastSeenAt: now }];
  }
  return [...list, { ...reading, firstSeenAt: now, lastSeenAt: now }];
}

module.exports = {
  readRankedSnapshot,
  applyReading,
  sameValues,
};
