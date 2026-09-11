// The census as files anyone can cite.
//
// A page can be screenshotted; a URL can be referenced. The site's one
// exclusive dataset was reachable only as a chart inside an article, so there
// was nothing for a wiki editor, a forum post or a spreadsheet to point at.
// These two files are written into the build by vite.config.js, from the same
// committed snapshot the page renders, so the file and the page can never
// disagree.
//
// Under /data/ and excluded from the Pages Function in public/_routes.json:
// the Function only rewrites HTML, but every request it sees is a billable
// invocation.

import { CENSUS_SNAPSHOT } from "./censusSnapshot.js";

const SOURCE = "https://www.pubgtracker.top/ranks";

// Short enough to travel with the file, specific enough that a reader can tell
// what the numbers do and do not answer. The long version is on the page.
const METHOD =
  "A daily random sample of PUBG ranked matches on the PC (Steam) shard, taking the current tier of fifteen players drawn from each match, pooled over the window below and counting each account once at its most recent reading. Because the sample is drawn from matches, a player who queues more often is likelier to appear in it: read a share as where a random ranked lobby seat sits, not as a headcount of accounts. Intervals are 95% and adjusted for lobby clustering; a tier whose own sample is too thin is marked publishable: false and carries no usable share. rpPercentiles, when present, is 101 rank-point readings at each whole percentile of the same sample, with index 0 the top of the ladder; it is absent or null when the sample is too thin to cut.";

export const censusJson = (snapshot) =>
  `${JSON.stringify({ ...snapshot, source: SOURCE, method: METHOD }, null, 2)}\n`;

const COLUMNS = [
  "season_id",
  "shard",
  "window_from",
  "window_to",
  "accounts",
  "matches",
  "tier",
  "count",
  "share",
  "ci_low",
  "ci_high",
  "effective_n",
  "design_effect",
  "publishable",
];

// One row per tier with the window repeated on each, rather than a header block
// above the table: a file that loads into a spreadsheet as-is is the point, and
// every field here is a number, a date or a lower-case word, so nothing needs
// quoting.
export const censusCsv = (snapshot) => {
  const rows = (snapshot?.tiers ?? []).map((row) =>
    [
      snapshot.seasonId,
      snapshot.shard,
      snapshot.firstDate,
      snapshot.lastDate,
      snapshot.accounts,
      snapshot.matches,
      row.tier,
      row.count,
      row.share,
      row.low,
      row.high,
      row.effectiveN,
      row.designEffect,
      row.publishable,
    ].join(","),
  );
  return `${[COLUMNS.join(","), ...rows].join("\n")}\n`;
};

export const CENSUS_DATA_FILES = CENSUS_SNAPSHOT
  ? [
      { path: "data/tier-census.json", body: censusJson(CENSUS_SNAPSHOT) },
      { path: "data/tier-census.csv", body: censusCsv(CENSUS_SNAPSHOT) },
    ]
  : [];

export const CENSUS_DATA_URL = "/data/tier-census.json";
export const CENSUS_CSV_URL = "/data/tier-census.csv";

// Whether the build has a snapshot to write these files from. The page links
// them only when it does: a snapshot too thin to render is also a snapshot too
// thin to publish, and a link to a file the build skipped is a 404 in the one
// place we are asking people to cite.
export const CENSUS_DATA_PUBLISHED = CENSUS_DATA_FILES.length > 0;
