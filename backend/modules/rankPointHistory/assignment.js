// Which rank reading absorbed which match, as a constraint problem.
//
// PUBG publishes no per-match RP, so the only evidence is a series of readings
// with a round counter. This module decides, for every match, the set of
// readings that could have been the one to count it -- and no more than that.
// It deals in interval indices and timestamps; RP values and the shape of the
// card belong to attribute.js.
//
// Interval k (1..n) is the gap between reading k-1 and reading k. Index 0 means
// "before the first reading" and n+1 means "after the last one".

const MIN = 60 * 1000;

// PUBG's own figure for how long a finished match takes to reach the API.
const LAG_MAX = 15 * MIN;

// The longest ranked round in practice (Erangel/Miramar run ~32 min). Used only
// when a cached payload carries no duration: assuming the longest match is
// conservative, where assuming an instant one would invent precision.
const MATCH_MAX = 35 * MIN;

// A match that consumed no round at all. Update 10.2 makes a match
// "competitively invalid" when the player leaves alive early: no round, no RP.
const VOID = -1;

// Nodes the search may visit before giving up. A realistic payload -- eight
// matches whose windows each span a handful of intervals -- stays orders of
// magnitude below this.
const NODE_BUDGET = 20000;

function parseTime(value) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function seconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : null;
}

// The earliest moment this match's round can be counted: the player has to be
// out of it first.
function diedAt(item) {
  const started = parseTime(item?.createdAt);
  if (started === null) return null;
  return started + (seconds(item?.survivalTime) ?? 0);
}

// The latest moment, before the lag is added.
function endedAt(item) {
  const started = parseTime(item?.createdAt);
  if (started === null) return null;
  return started + (seconds(item?.duration) ?? MATCH_MAX);
}

// Drops readings that cannot be part of a real progression and collapses
// repeats, so the intervals built from the result mean something.
//
// A counter that goes backwards is a stale read landing after a newer one --
// two writers racing, which the live view and a second visit can produce. An
// adjacent repeat is the same state seen twice; merging it extends how long we
// know that state held, which is exactly what the upper bound below reads.
function sanitizeSeries(raw) {
  const series = [];
  let maxRounds = -Infinity;
  (Array.isArray(raw) ? raw : []).forEach((reading) => {
    if (!reading) return;
    if (reading.roundsPlayed < maxRounds) return;
    maxRounds = reading.roundsPlayed;
    const prev = series[series.length - 1];
    if (prev && prev.roundsPlayed === reading.roundsPlayed && prev.rankPoint === reading.rankPoint) {
      prev.lastSeenAt = Math.max(prev.lastSeenAt, reading.lastSeenAt);
      return;
    }
    series.push({ ...reading });
  });
  return series;
}

// Per-item [lo, hi] over interval indices, plus where an interval is allowed to
// hold rounds we cannot see.
function feasibilityWindows({ series, items, fetchedAt = null, complete = false, maxHistory }) {
  const n = series.length - 1;
  const windows = {};

  items.forEach((item, index) => {
    const died = diedAt(item);
    const ended = endedAt(item);
    if (died === null || ended === null) return;

    let lo = series.findIndex((reading) => reading.firstSeenAt >= died);
    if (lo === -1) lo = n + 1;
    let hi = series.findIndex((reading) => reading.lastSeenAt >= ended + LAG_MAX);
    if (hi === -1) hi = n + 1;
    // The lag assumption does not hold for this item -- the reading that should
    // already carry it sits before the death. Keep the bound we trust and open
    // the other rather than emit an empty window.
    if (hi < lo) hi = n + 1;
    windows[index] = [lo, hi];
  });

  const listFetchedAt = fetchedAt ?? (n >= 0 ? series[n].firstSeenAt : null);
  const oldestCreated = items.reduce((min, item) => {
    const started = parseTime(item?.createdAt);
    return started !== null && started < min ? started : min;
  }, Infinity);

  // An older match we never fetched could still be landing in this interval.
  const openOlder = (k) =>
    !complete &&
    items.length >= maxHistory &&
    series[k - 1].lastSeenAt < oldestCreated + MATCH_MAX + LAG_MAX;

  // A match that has ended may not have reached the list we fetched.
  const openNewer = (k) => listFetchedAt !== null && series[k].firstSeenAt > listFetchedAt - LAG_MAX;

  return {
    windows,
    slackAllowed: (k) => openOlder(k) || openNewer(k),
  };
}

// Every way the matches could be laid across the intervals without contradicting
// the round counter, the time windows or the order constraint.
//
// Returns nothing at all when the budget runs out: a truncated set of solutions
// can agree with itself by accident, and a caller reading agreement as certainty
// would then print a confidently wrong number.
function enumerateAssignments({ order, windows, dRounds, orderPairs, slackAllowed, voidable, n, budget = NODE_BUDGET }) {
  const counts = new Array(n + 2).fill(0);
  const assign = {};
  const solutions = [];
  const slackUsed = new Set();
  let nodes = 0;
  let exhausted = false;

  const feasible = () => {
    for (let k = 1; k <= n; k += 1) {
      if (counts[k] > dRounds[k]) return false;
      if (counts[k] < dRounds[k] && !slackAllowed(k)) return false;
    }
    return true;
  };

  const breaksOrder = (item, k) =>
    orderPairs.some(
      ([before, after]) =>
        after === item && assign[before] !== undefined && assign[before] !== VOID && assign[before] > k
    );

  function search(depth) {
    if (exhausted) return;
    nodes += 1;
    if (nodes > budget) {
      exhausted = true;
      return;
    }
    if (depth === order.length) {
      if (!feasible()) return;
      solutions.push({ ...assign });
      for (let k = 1; k <= n; k += 1) if (counts[k] < dRounds[k]) slackUsed.add(k);
      return;
    }

    const item = order[depth];
    const [lo, hi] = windows[item];
    const options = voidable.has(item) ? [VOID] : [];
    for (let k = lo; k <= hi; k += 1) options.push(k);

    for (const k of options) {
      if (exhausted) return;
      if (k >= 1 && k <= n && counts[k] + 1 > dRounds[k]) continue;
      if (k !== VOID && breaksOrder(item, k)) continue;
      assign[item] = k;
      if (k !== VOID) counts[k] += 1;
      search(depth + 1);
      if (k !== VOID) counts[k] -= 1;
      delete assign[item];
    }
  }

  search(0);

  if (exhausted) return { solutions: [], slackUsed: new Set(), exhausted: true };
  return { solutions, slackUsed, exhausted: false };
}

module.exports = {
  sanitizeSeries,
  feasibilityWindows,
  enumerateAssignments,
  diedAt,
  endedAt,
  parseTime,
  LAG_MAX,
  MATCH_MAX,
  VOID,
  NODE_BUDGET,
};
