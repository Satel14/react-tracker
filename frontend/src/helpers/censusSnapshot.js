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
  if (!hasLadderReading(data)) return null;
  if (!data.firstDate || !data.lastDate) return null;
  if (!(Number(data.accounts) > 0)) return null;
  return data;
};

export const CENSUS_SNAPSHOT = usableSnapshot(snapshot);

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
