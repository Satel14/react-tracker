const {
  sanitizeSeries,
  feasibilityWindows,
  enumerateAssignments,
  endedAt,
  parseTime,
  VOID,
} = require("./assignment");

// Decay applies from Diamond up; keep in step with the ladder in playerRank/ranked.js.
const DECAY_TIERS = new Set(["diamond", "crystal", "master", "grandmaster", "survivor", "top500"]);
const DECAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Keep in step with MAX_MATCH_HISTORY in playerRank/enrichment.js. Only used to
// tell a full page (which may be hiding older matches) from a short one.
const MAX_HISTORY = 8;

// Update 10.2: leaving a match alive early makes it "competitively invalid" --
// no round, no RP. Anything longer than this was played out.
const VOID_SURVIVAL_MS = 8 * 60 * 1000;

function isCompetitive(item) {
  return item?.matchType === "competitive";
}

// Matches that may have consumed no round at all, so the search can try leaving
// them out.
//
// This needs positive evidence, not a gap in the data. PUBG marks the
// abandonment case as `logout`; a payload with no deathType at all is an old
// cached one, and reading its silence as "might not have counted" would put
// every row of it beyond attribution.
function voidCandidates(items, indices) {
  const candidates = new Set();
  indices.forEach((index) => {
    const item = items[index];
    if (item?.deathType !== "logout") return;
    const survival = Number(item?.survivalTime);
    if (!Number.isFinite(survival) || survival * 1000 <= VOID_SURVIVAL_MS) candidates.add(index);
  });
  return candidates;
}

function buildDiffs(series, n) {
  const dRounds = [];
  const dRP = [];
  for (let k = 1; k <= n; k += 1) {
    dRounds[k] = series[k].roundsPlayed - series[k - 1].roundsPlayed;
    dRP[k] =
      series[k].rankPoint === null || series[k - 1].rankPoint === null
        ? null
        : series[k].rankPoint - series[k - 1].rankPoint;
  }
  return { dRounds, dRP };
}

// Spans are what the header line is written from: a run of intervals the card
// can talk about as one thing.
//
// Intervals merge only while the same rows sit in them. Merging by "is anything
// here at all" would fuse a group of two into the single exact match that
// followed it and report the pair as one lump -- which is the shape the header
// exists to avoid.
function buildSpans({ series, n, dRounds, dRP, rowsAt, exactRows }) {
  const spans = [];
  const total = (from, to) => {
    let value = 0;
    let rounds = 0;
    for (let k = from; k <= to; k += 1) {
      rounds += dRounds[k];
      if (dRP[k] === null) return { value: null, rounds };
      value += dRP[k];
    }
    return { value, rounds };
  };
  const keyAt = (k) => (rowsAt.get(k) || []).join(",");

  let k = 1;
  while (k <= n) {
    const key = keyAt(k);
    let j = k;
    while (j + 1 <= n && keyAt(j + 1) === key) j += 1;
    const rows = rowsAt.get(k) || [];
    const { value, rounds } = total(k, j);
    let kind;
    if (value === null) kind = "unattributed";
    else if (rows.length) {
      kind = k === j && rounds === 1 && rows.every((row) => exactRows.has(row)) ? "exact" : "group";
    } else if (rounds > 0) kind = "group";
    else kind = value !== 0 ? "adjustment" : "none";
    spans.push({ from: series[k - 1].lastSeenAt, to: series[j].firstSeenAt, kind, value, rounds });
    k = j + 1;
  }
  return spans;
}

// A trailing 0/0 span (two instances stored the same reading) records no change,
// so the newest span that means anything is the one before it.
function summarize(spans) {
  let k = spans.length - 1;
  while (k >= 0 && spans[k].kind === "none") k -= 1;
  const newest = spans[k];
  if (!newest || (newest.kind !== "group" && newest.kind !== "adjustment")) return null;
  return { kind: newest.kind, value: newest.value, matches: newest.rounds, since: newest.from };
}

// The annotated object replaces `matches` in the payload that gets cached, so
// anything dropped here is dropped from the cache too -- including fetchedAt and
// complete, which this module itself reads on the way back in.
function withDeltas(matches, items, deltas, summary, spans) {
  return {
    ...matches,
    summary: { ...summary, rankPoints: spans ? summarize(spans) : null },
    items: items.map((item, index) => ({
      ...item,
      rpDelta:
        deltas[index] === undefined ? (isCompetitive(item) ? { kind: "unattributed" } : null) : deltas[index],
    })),
  };
}

function attributeRankPoints({ series: raw, matches }) {
  const items = Array.isArray(matches?.items) ? matches.items : [];
  const summary = matches?.summary || {};
  const series = sanitizeSeries(raw);
  const n = series.length - 1;
  const deltas = new Array(items.length).fill(undefined);

  items.forEach((item, index) => {
    if (!isCompetitive(item)) deltas[index] = null;
  });

  if (n < 0) {
    items.forEach((item, index) => {
      if (isCompetitive(item)) deltas[index] = { kind: "noBaseline" };
    });
    return withDeltas(matches, items, deltas, summary, null);
  }

  const { dRounds, dRP } = buildDiffs(series, n);
  const { windows, slackAllowed } = feasibilityWindows({
    series,
    items,
    fetchedAt: parseTime(matches?.fetchedAt),
    complete: matches?.complete === true,
    maxHistory: MAX_HISTORY,
  });

  // A competitive match with an unreadable timestamp can never be placed.
  items.forEach((item, index) => {
    if (isCompetitive(item) && windows[index] === undefined) deltas[index] = { kind: "unattributed" };
  });

  const order = items
    .map((_item, index) => index)
    .filter((index) => isCompetitive(items[index]) && windows[index] !== undefined)
    .sort((a, b) => parseTime(items[a].createdAt) - parseTime(items[b].createdAt));

  // A4: where two matches ended in the order they were created, the rounds were
  // counted in that order too. Pairs whose ends invert -- an early death in a
  // long match, then a short one that finishes first -- carry no constraint.
  const orderPairs = [];
  order.forEach((i, position) => {
    order.slice(position + 1).forEach((j) => {
      if (endedAt(items[i]) <= endedAt(items[j])) orderPairs.push([i, j]);
    });
  });

  const { solutions, slackUsed, exhausted } = enumerateAssignments({
    order,
    windows,
    dRounds,
    orderPairs,
    slackAllowed,
    voidable: voidCandidates(items, order),
    n,
  });

  const rowsAt = new Map();
  const exactRows = new Set();
  const placeRow = (index, from, to) => {
    for (let k = from; k <= to; k += 1) {
      if (!rowsAt.has(k)) rowsAt.set(k, []);
      rowsAt.get(k).push(index);
    }
  };

  // The search gave up. Every visible match is somewhere in the whole stretch
  // and we cannot say more than that -- so say exactly that, and never an exact.
  //
  // Logged because the result is indistinguishable from a genuinely ambiguous
  // session: one wide group, which is the shape this rule exists to narrow. If
  // this line ever appears in production, the budget is the thing to look at.
  if (exhausted) {
    console.log(`[RP] attribution budget exhausted: ${order.length} matches across ${n} intervals, falling back to one group`);
    order.forEach((index) => placeRow(index, 1, n));
    const spans = buildSpans({ series, n, dRounds, dRP, rowsAt, exactRows });
    const whole = spans[0];
    order.forEach((index) => {
      deltas[index] =
        whole && whole.value !== null
          ? { kind: "group", value: whole.value, matches: whole.rounds }
          : { kind: "unattributed" };
    });
    return withDeltas(matches, items, deltas, summary, spans);
  }

  // Nothing fits: the readings and the match list contradict each other. The
  // header stays silent too -- a total it cannot place on any row is a number
  // the page would be asserting on its own authority.
  if (!solutions.length) {
    order.forEach((index) => {
      deltas[index] = { kind: "unattributed" };
    });
    return withDeltas(matches, items, deltas, summary, null);
  }

  const spanTotals = (from, to) => {
    let value = 0;
    let rounds = 0;
    for (let k = from; k <= to; k += 1) {
      rounds += dRounds[k];
      if (dRP[k] === null) return { value: null, rounds };
      value += dRP[k];
    }
    return { value, rounds };
  };

  // Rank decay moves RP with no match behind it, so a long quiet stretch at a
  // decaying tier cannot be read as a match result.
  const decayed = (from, to) => {
    const tier = typeof series[from - 1].tier === "string" ? series[from - 1].tier.toLowerCase() : null;
    return series[to].firstSeenAt - series[from - 1].lastSeenAt > DECAY_WINDOW_MS && DECAY_TIERS.has(tier);
  };

  order.forEach((index) => {
    const placements = new Set(solutions.map((solution) => solution[index]));

    // It may be a match that consumed no round -- or another one may be, which
    // would shift this one. Either way the number is not ours to print.
    if (placements.has(VOID)) {
      deltas[index] = { kind: "unattributed" };
      return;
    }

    const first = Math.min(...placements);
    const last = Math.max(...placements);
    if (first === 0 && last === 0) {
      deltas[index] = { kind: "noBaseline" };
      return;
    }
    if (first === n + 1 && last === n + 1) {
      deltas[index] = { kind: "pending" };
      return;
    }
    // Straddling either edge: it might predate the baseline, or might not have
    // landed yet. Both readings of it are live, so neither can be shown.
    if (first === 0 || last === n + 1 || decayed(first, last)) {
      deltas[index] = { kind: "unattributed" };
      return;
    }

    const { value, rounds } = spanTotals(first, last);
    if (value === null) {
      deltas[index] = { kind: "unattributed" };
      return;
    }

    placeRow(index, first, last);
    if (first === last && rounds === 1 && !slackUsed.has(first)) {
      exactRows.add(index);
      deltas[index] = { kind: "exact", value };
    } else {
      deltas[index] = { kind: "group", value, matches: rounds };
    }
  });

  return withDeltas(matches, items, deltas, summary, buildSpans({ series, n, dRounds, dRP, rowsAt, exactRows }));
}

module.exports = {
  attributeRankPoints,
  DECAY_TIERS,
  DECAY_WINDOW_MS,
  MAX_HISTORY,
};
