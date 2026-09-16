// What this process has done since it started.
//
// Deliberately not a metrics backend. A free Render instance spins down after
// 15 minutes idle, so these counters reset several times a day, and the
// six-hourly health watch wakes the instance with its own request -- meaning the
// automated reader would only ever see a process seconds old with everything at
// zero. They are here for a person: curl /healthz while real traffic is on it,
// or straight after an incident, and see where the requests went. Anything that
// has to survive a restart belongs in Postgres, and Postgres transfer is
// metered, which is the whole reason this is in memory.
//
// uptime rides alongside them in /healthz for exactly that reason: a count
// without the window it was gathered over is not a number anybody can read.

const OUTCOMES = ["fresh", "cached", "stale", "coalesced"];

let rankLookups;
let rateLimit;
let rankPointReadings;

const tally = () => ({ count: 0, lastAt: 0 });

function __resetRuntimeStats() {
  rankLookups = { fresh: 0, cached: 0, stale: 0, coalesced: 0 };
  rateLimit = tally();
  rankPointReadings = tally();
}

__resetRuntimeStats();

function bump(counter) {
  counter.count += 1;
  counter.lastAt = Date.now();
}

const report = (counter) => ({
  count: counter.count,
  lastAt: counter.lastAt ? new Date(counter.lastAt).toISOString() : null,
});

function recordRankLookup(outcome) {
  if (!OUTCOMES.includes(outcome)) return;
  rankLookups[outcome] += 1;
}

function recordRateLimit() {
  bump(rateLimit);
}

function recordRankPointReading() {
  bump(rankPointReadings);
}

function getRuntimeStats() {
  const total = OUTCOMES.reduce((sum, outcome) => sum + rankLookups[outcome], 0);

  return {
    rankLookups: {
      total,
      ...rankLookups,
      // The share answered without a full upstream fetch. Reported rather than
      // left to be divided by hand, and null rather than 0 when nothing has
      // been served: "no lookups yet" and "every lookup went upstream" are
      // opposite readings that must not share a number.
      //
      // Not "cost no PUBG request", which is what this was first called and is
      // not true: a warm statsCache hit still spends one ranked request to
      // record a rank-point reading, at most once a minute per player and
      // season. Those are counted separately as rankPointReadings, so the two
      // together say what the budget actually saw.
      servedFromCachePct: total
        ? Math.round(((total - rankLookups.fresh) / total) * 100)
        : null,
    },
    rateLimit: report(rateLimit),
    rankPointReadings: report(rankPointReadings),
  };
}

module.exports = {
  recordRankLookup,
  recordRateLimit,
  recordRankPointReading,
  getRuntimeStats,
  __resetRuntimeStats,
};
