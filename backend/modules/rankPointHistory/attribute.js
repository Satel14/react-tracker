// Decay applies from Diamond up; keep in step with the ladder in playerRank/ranked.js.
const DECAY_TIERS = new Set(["diamond", "crystal", "master", "grandmaster", "survivor", "top500"]);
const DECAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isCompetitive(item) {
  return item?.matchType === "competitive";
}

function parseTime(value) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

// PUBG can only count a match once it has ended, and a match runs 20-30 minutes.
// Placing a match by when it started credits a reading taken mid-match with a
// result it cannot hold yet: it hides the first match of a session behind the
// baseline, and hands the oldest visible row a delta earned by an older match
// that never made the list. Older cached payloads carry no duration, so fall
// back to the start time and keep their behaviour unchanged.
function endTime(item) {
  const started = parseTime(item?.createdAt);
  if (started === null) return null;
  const duration = Number(item?.duration);
  return Number.isFinite(duration) && duration > 0 ? started + duration * 1000 : started;
}

function buildIntervals(series) {
  const intervals = [];
  for (let k = 1; k < series.length; k += 1) {
    const prev = series[k - 1];
    const cur = series[k];
    intervals.push({
      from: prev.lastSeenAt,
      to: cur.firstSeenAt,
      dRP: prev.rankPoint === null || cur.rankPoint === null ? null : cur.rankPoint - prev.rankPoint,
      dRounds: cur.roundsPlayed - prev.roundsPlayed,
      tierBefore: prev.tier ?? null,
      candidates: [],
    });
  }
  return intervals;
}

// A match belongs to the first reading that could have absorbed it, measured
// from when the match ended rather than when it began.
function assignCandidates(series, intervals, items, deltas) {
  const first = series[0];
  const last = series[series.length - 1];
  items.forEach((item, index) => {
    if (!isCompetitive(item)) {
      deltas[index] = null;
      return;
    }
    const t = endTime(item);
    if (t === null) {
      deltas[index] = { kind: "unattributed" };
      return;
    }
    if (t <= first.firstSeenAt) {
      deltas[index] = { kind: "noBaseline" };
      return;
    }
    if (t > last.firstSeenAt) {
      deltas[index] = { kind: "pending" };
      return;
    }
    const k = intervals.findIndex((interval) => t <= interval.to);
    intervals[k].candidates.push(index);
  });
}

function classify({ dRP, rounds, candidates, truncated, spanMs, tierBefore }) {
  if (dRP === null) return "unattributed";
  if (candidates === 0 && rounds === 0) return dRP !== 0 ? "adjustment" : "none";
  const decayTier = typeof tierBefore === "string" ? tierBefore.toLowerCase() : null;
  if (spanMs > DECAY_WINDOW_MS && DECAY_TIERS.has(decayTier)) return "unattributed";
  if (candidates === rounds && rounds === 1) return "exact";
  if (candidates === rounds) return "group";
  if (truncated && candidates < rounds) return "group";
  return "unattributed";
}

// Merges forward while the counters disagree: a match can show up in the list
// before the ranked endpoint has counted it, so its RP lands in a later reading.
function resolveSpans(intervals, oldestVisibleAt) {
  const spans = [];
  let i = 0;
  while (i < intervals.length) {
    let j = i;
    let candidates = intervals[i].candidates.length;
    let rounds = intervals[i].dRounds;
    const from = intervals[i].from;
    const truncated = oldestVisibleAt > from;
    while (candidates !== rounds && !(truncated && candidates < rounds) && j + 1 < intervals.length) {
      j += 1;
      candidates += intervals[j].candidates.length;
      rounds += intervals[j].dRounds;
    }
    const slice = intervals.slice(i, j + 1);
    const dRP = slice.some((x) => x.dRP === null) ? null : slice.reduce((sum, x) => sum + x.dRP, 0);
    const to = intervals[j].to;
    spans.push({
      from,
      to,
      dRP,
      rounds,
      candidates: slice.flatMap((x) => x.candidates),
      kind: classify({ dRP, rounds, candidates, truncated, spanMs: to - from, tierBefore: intervals[i].tierBefore }),
    });
    i = j + 1;
  }
  return spans;
}

function annotateSpans(spans, deltas) {
  spans.forEach((span) => {
    span.candidates.forEach((index) => {
      if (span.kind === "exact") deltas[index] = { kind: "exact", value: span.dRP };
      else if (span.kind === "group") deltas[index] = { kind: "group", value: span.dRP, matches: span.rounds };
      else deltas[index] = { kind: "unattributed" };
    });
  });
}

// A trailing 0/0 span (two instances stored the same reading) records no change,
// so the newest span that means anything is the one before it.
function summarize(spans) {
  let k = spans.length - 1;
  while (k >= 0 && spans[k].kind === "none") k -= 1;
  const newest = spans[k];
  if (!newest || (newest.kind !== "group" && newest.kind !== "adjustment")) return null;
  return { kind: newest.kind, value: newest.dRP, matches: newest.rounds, since: newest.from };
}

function attributeRankPoints({ series, matches }) {
  const items = Array.isArray(matches?.items) ? matches.items : [];
  const summary = matches?.summary || {};
  const list = Array.isArray(series) ? series : [];
  const deltas = new Array(items.length).fill(undefined);

  if (!list.length) {
    return {
      summary: { ...summary, rankPoints: null },
      items: items.map((item) => ({ ...item, rpDelta: isCompetitive(item) ? { kind: "noBaseline" } : null })),
    };
  }

  const intervals = buildIntervals(list);
  assignCandidates(list, intervals, items, deltas);
  const oldestVisibleAt = items.reduce((min, item) => {
    const t = parseTime(item.createdAt);
    return t !== null && t < min ? t : min;
  }, Infinity);
  const spans = resolveSpans(intervals, oldestVisibleAt);
  annotateSpans(spans, deltas);

  return {
    summary: { ...summary, rankPoints: summarize(spans) },
    items: items.map((item, index) => ({
      ...item,
      rpDelta: deltas[index] === undefined ? (isCompetitive(item) ? { kind: "unattributed" } : null) : deltas[index],
    })),
  };
}

module.exports = {
  attributeRankPoints,
  DECAY_TIERS,
  DECAY_WINDOW_MS,
};
