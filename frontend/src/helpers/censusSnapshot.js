// The last tier census reading, committed to the repo by the daily job in
// .github/workflows/tier-census.yml.
//
// It exists because the numbers used to reach the page only through a fetch in
// TierDistribution's effect, which meant two things. A build-time render --
// which is what a crawler and every answer engine read -- baked the words
// "Reading the latest sample…" into the one section of the site nobody else
// publishes. And a visitor arriving after any quiet quarter of an hour watched
// that same line while the free Render instance cold-started, which took the
// better part of half a minute.
//
// The committed reading is the component's initial state, so both of those read
// numbers immediately, and the live fetch still overwrites it. It is a snapshot
// and says so: the window it was measured over is printed beside it.
//
// Extension-free imports elsewhere in src/; this file is also pulled in by
// routeMeta.js, which vite.config.js loads under Node's resolver -- hence the
// spelled-out .json specifier below, which resolves under both.

import snapshot from "../data/tierCensus.json";

// "division.bro.official.pc-2018-42" -> "42".
export const snapshotSeasonNumber = (data = snapshot) =>
  (typeof data?.seasonId === "string" && data.seasonId.match(/(\d+)\s*$/)?.[1]) || "";

// Players with no ranked record who turned up in a ranked lobby. A row of the
// table like any other, but never a distribution on its own.
export const UNRANKED = "unranked";

// Whether a reading is a tier distribution at all.
//
// The unranked bucket is deliberately excluded. On the first day of a season
// the census measures a sample of lobbies played under the previous one
// against the new season's ladder, and every player in it comes back unplaced:
// a reading of 100% unranked, publishable by every statistical test, and an
// answer to a question nobody asked. The page's subject is where players sit
// on the ladder, so at least one rung of it has to be measured.
export const hasLadderReading = (data) =>
  (data?.tiers ?? []).some((row) => row?.publishable && row.tier !== UNRANKED);

// How many daily samples have to stand behind a reading before it is a
// distribution rather than a day.
//
// Hand-typed here and as MIN_WINDOWS in backend/controllers/census.js, the same
// way RP_TABLE_LENGTH below mirrors PERCENTILE_STEPS: neither side reads the
// other's value. The backend uses it to decide which season to serve and cannot
// apply it here, because when it has no earlier season to fall back to it still
// has to answer with something -- and it does, honestly, by reporting how thin
// the answer is. This is the side that has the finished season in hand.
export const MIN_POOLED_WINDOWS = 3;

// Absence is not zero: a payload from a deploy that predates the field, or a
// fixture written without it, is unknown rather than empty. Only a count that
// is actually reported and actually short is refused.
const pooledEnough = (data) =>
  data?.windows === null || data?.windows === undefined
    ? true
    : Number(data.windows) >= MIN_POOLED_WINDOWS;

// Whether a reading may be drawn as the tier distribution.
//
// Two independent questions, and the per-tier statistics only answer the first.
// A tier clears its own bar on the strength of how often it was SEEN, which one
// busy day supplies easily; it says nothing about whether that day is
// representative of the season. The second day of a reset is the case that
// proves them separate -- five publishable rungs, and Gold twelve points above
// where a pooled week put it, because the sample was measuring re-climbing
// rather than standing.
export const publishableReading = (data) => hasLadderReading(data) && pooledEnough(data);

// Whether a reading can stand in a static file for a day or two.
//
// The bar is not "did the request succeed" but "is this still true tomorrow".
// A reading with nothing publishable in it renders the sentence about
// collection having only just started, which is a claim about this minute; a
// reading that cannot name its own window cannot be read as a snapshot at all.
// In both cases the live fetch is the honest source and the loading line is the
// honest placeholder.
export const usableSnapshot = (data) => {
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.tiers)) return null;
  if (!publishableReading(data)) return null;
  if (!data.firstDate || !data.lastDate) return null;
  if (!(Number(data.accounts) > 0)) return null;
  return data;
};

export const CENSUS_SNAPSHOT = usableSnapshot(snapshot);

// rpThresholds ships exactly PERCENTILE_STEPS + 1 readings, highest first.
export const RP_TABLE_LENGTH = 101;

// The committed RP table, or null when there is not one worth rendering.
//
// Both properties checked here are load-bearing rather than incidental. The
// length is what makes an index a percentile: on a shorter array index 50 is
// not the median of anything. The order is what makes rpPercentile a lookup at
// all -- it finds a standing with findIndex(threshold <= rp), which on a
// scrambled array returns a confidently wrong number instead of nothing.
//
// Deliberately NOT folded into usableSnapshot. A sample too thin to cut leaves
// rpPercentiles null while the tier shares stay good, and gating the snapshot
// on it would blank the distribution on /ranks to protect a page that has its
// own empty state.
export const rpTable = (data) => {
  const values = data?.rpPercentiles;
  if (!Array.isArray(values) || values.length !== RP_TABLE_LENGTH) return null;

  // A real number, not a coercible one: Number(null) and Number("") are both 0
  // and both finite, so a hole in the table would enter it as zero RP.
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;

  // Non-ascending rather than strictly descending: whole percentile bands share
  // a value wherever the ladder is crowded, and at ~11,800 accounts that is the
  // normal shape rather than a fault.
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[i - 1]) return null;
  }

  return values;
};

// How many independent readings the sample is worth, for the tier where lobby
// clustering bites hardest.
//
// The smallest effective sample of the published tiers rather than the average:
// the sentence beside the table is what licenses every interval on it, and the
// only figure that holds for all of them is the tightest one. Rounded, because
// "1,910" would read as a measurement of something it is an adjustment to.
export const effectiveReadings = (data) => {
  const published = (data?.tiers ?? []).filter((row) => row?.publishable);
  if (!published.length) return null;
  const smallest = Math.min(...published.map((row) => Number(row.effectiveN) || 0));
  const step = smallest >= 1000 ? 100 : 10;
  return Math.round(smallest / step) * step;
};

// The committed lobby mix, or null when there is not one worth rendering.
//
// The sum check is the load-bearing one. A row is a distribution over the
// lobby, so its shares add to one by construction; a row that does not is an
// aggregation that drifted, and drawing it would put a bar chart on the page
// whose bars mean nothing. Whole-payload refusal rather than per-row, because a
// build that produced one broken row has no claim to the others. An EMPTY mix
// is exempt from the sum check rather than failing it: lobbyMix.js emits one
// for a tier whose lobbies held no other sampled player at all, and zero
// summing to zero is the correct reading of that, not drift.
//
// Deliberately NOT folded into usableSnapshot, for the reason rpTable is not: a
// mix too thin to draw must not blank the tier distribution on /ranks.
const MIX_SUM_TOLERANCE = 1e-6;

export const lobbyMixRows = (data) => {
  const rows = data?.lobbyMix;
  if (!Array.isArray(rows) || !rows.length) return null;

  for (const row of rows) {
    if (!Array.isArray(row?.mix)) return null;
    if (!row.mix.length) continue;
    // A coercible value like null or "" is not a number; only real finite numbers count.
    if (!row.mix.every((cell) => typeof cell?.share === "number" && Number.isFinite(cell.share))) return null;
    const total = row.mix.reduce((sum, cell) => sum + cell.share, 0);
    if (Math.abs(total - 1) > MIX_SUM_TOLERANCE) return null;
  }

  const published = rows.filter((row) => row.publishable);
  if (!published.length) return null;

  // Attached rather than returned alongside, so the truthiness check
  // RankedLobbies.jsx runs against this function's result is unchanged: the
  // return value is still exactly the array of publishable rows, just one that
  // also remembers what it left out and why.
  published.gated = rows.filter((row) => !row.publishable);
  return published;
};
