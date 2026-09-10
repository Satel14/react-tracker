const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { seasonForWindow, previousSeasonId, seasonStartDate } = require("./seasonWindow");

const S42 = "division.bro.official.pc-2018-42";
const S43 = "division.bro.official.pc-2018-43";

// Season 43 opened when the 43.1 maintenance ended, 2026-09-10 08:30 UTC.
const START_43 = "2026-09-10T08:30:00Z";

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

test("an unknown start date leaves the current season in charge", () => {
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
