const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { seasonForWindow, previousSeasonId, seasonStartDate, seasonEndDate } = require("./seasonWindow");

const S42 = "division.bro.official.pc-2018-42";
const S43 = "division.bro.official.pc-2018-43";
const S44 = "division.bro.official.pc-2018-44";

// Season 43 opened when the 43.1 maintenance ended, 2026-09-10 08:30 UTC.
const START_43 = "2026-09-10T08:30:00Z";
// And ended when the 44.1 maintenance began, 2026-11-04 00:00 UTC.
const END_43 = "2026-11-04T00:00:00Z";

// --- which season a sample day belongs to ---
//
// The collector reads a tier out of one season's ladder and the sample it
// draws players from is two days old, so on a rollover day those are two
// different seasons. Asking "what is this player's tier in the season that
// started this morning" about players drawn from matches played under the
// previous one answers "unranked" for every single one of them -- which is
// true, and a measurement of nothing.

test("a sample day inside the season is measured against that season", () => {
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-12",
      currentSeasonId: S43,
      previousSeasonId: S42,
      startDate: START_43,
    }),
    S43,
  );
});

test("a sample day from before the new season opened belongs to the old one", () => {
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-08",
      currentSeasonId: S43,
      previousSeasonId: S42,
      startDate: START_43,
    }),
    S42,
  );
});

// A finished season's ranked stats stay readable, so the old season is a real
// answer here rather than a consolation: the last days of 42 can still be
// collected after 43 has opened.

test("the day a season opens belongs to neither", () => {
  // Matches on 2026-09-10 were played on both sides of the maintenance, and
  // one calendar day is the finest cut PUBG's sample offers. Either tag would
  // be wrong for part of it, so the day is skipped.
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-10",
      currentSeasonId: S43,
      previousSeasonId: S42,
      startDate: START_43,
    }),
    null,
  );
});

test("an unknown start date and no end to fall back on leave the current season in charge", () => {
  // season-dates.json is hand-maintained and the countdown already depends on
  // it. If it ever falls behind, the census carrying on as before is a much
  // smaller fault than the census quietly stopping.
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-08",
      currentSeasonId: S43,
      previousSeasonId: S42,
      startDate: null,
    }),
    S43,
  );
});

// What happened on 2026-11-04. PUBG named Season 44 current at the 00:00 UTC
// maintenance, the 06:12 run drew 2026-11-02, and with no 44 entry in the file
// yet the rule above stored a day of Season 43 lobbies as Season 44. Season
// 43's end had been in the file since September, read off the in-game timer:
// the date a new season's start is usually missing on is the date the old
// season's end is already known.
test("an unknown start date falls back on the previous season's measured end", () => {
  const dayBy = (windowDate) =>
    seasonForWindow({
      windowDate,
      currentSeasonId: S44,
      previousSeasonId: S43,
      startDate: null,
      previousEndDate: END_43,
    });

  assert.equal(dayBy("2026-11-02"), S43);
  assert.equal(dayBy("2026-11-03"), S43);
  assert.equal(dayBy("2026-11-04"), null, "the day the old season ended belongs to neither");
  assert.equal(dayBy("2026-11-05"), S44);
});

test("a known start date outranks the previous season's end", () => {
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-12",
      currentSeasonId: S43,
      previousSeasonId: S42,
      startDate: START_43,
      previousEndDate: "2026-09-20T00:00:00Z",
    }),
    S43,
  );
});

test("an old sample day with no season to attribute it to is skipped", () => {
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-08",
      currentSeasonId: S43,
      previousSeasonId: null,
      startDate: START_43,
    }),
    null,
  );
});

test("no sample day, no season", () => {
  assert.equal(
    seasonForWindow({ windowDate: null, currentSeasonId: S43, startDate: START_43 }),
    null,
  );
});

test("a start date that does not parse is treated as unknown", () => {
  assert.equal(
    seasonForWindow({
      windowDate: "2026-09-08",
      currentSeasonId: S43,
      previousSeasonId: S42,
      startDate: "soon",
    }),
    S43,
  );
});

// --- the file the rule reads from ---
//
// seasonDates.test.js guards what is in that file; this guards that the census
// is reading the same one the countdown does, rather than a copy that could
// drift.

test("reads a season's start out of season-dates.json", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "json", "season-dates.json"), "utf8"),
  );

  for (const [id, season] of Object.entries(config.seasons)) {
    assert.equal(seasonStartDate(id), season.startDate, `${id}: not the file's start date`);
  }
});

test("has no start date for a season the file has never heard of", () => {
  assert.equal(seasonStartDate("division.bro.official.pc-2018-99"), null);
  assert.equal(seasonStartDate(undefined), null);
});

// An estimated end is a guess about the future. Attributing sample days by it
// would, on a guess that runs late, read new-season lobbies against the old
// season's frozen ladder: plausible numbers, filed under a season whose final
// figures are already published, and no gate looks for that.
test("reads a season's end only when it was measured, not estimated", () => {
  const dates = {
    seasons: {
      [S42]: { startDate: "2026-06-17T00:00:00Z", endDate: "2026-09-10T00:00:00Z", isEstimated: false },
      [S43]: { startDate: START_43, endDate: "2026-12-04T08:30:00Z", isEstimated: true },
    },
  };

  assert.equal(seasonEndDate(S42, dates), "2026-09-10T00:00:00Z");
  assert.equal(seasonEndDate(S43, dates), null);
  assert.equal(seasonEndDate("division.bro.official.pc-2018-99", dates), null);
});

test("reads season ends out of season-dates.json by default", () => {
  assert.equal(seasonEndDate(S43), END_43);
});

// --- the season below the current one ---

test("names the season below the current one in the catalog", () => {
  const catalog = {
    currentSeasonId: S43,
    seasons: [
      { id: S43, seasonNumber: 43 },
      { id: S42, seasonNumber: 42 },
      { id: "division.bro.official.pc-2018-41", seasonNumber: 41 },
    ],
  };

  assert.equal(previousSeasonId(catalog), S42);
});

test("names nothing when the catalog holds no earlier season", () => {
  assert.equal(previousSeasonId({ currentSeasonId: S43, seasons: [{ id: S43, seasonNumber: 43 }] }), null);
  assert.equal(previousSeasonId(null), null);
});

test("ignores the order the catalog happens to arrive in", () => {
  const catalog = {
    currentSeasonId: S43,
    seasons: [
      { id: "division.bro.official.pc-2018-41", seasonNumber: 41 },
      { id: S43, seasonNumber: 43 },
      { id: S42, seasonNumber: 42 },
    ],
  };

  assert.equal(previousSeasonId(catalog), S42);
});
