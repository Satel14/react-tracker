const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// PUBG's /seasons endpoint returns an id, a label and isCurrentSeason and no
// dates at all -- checked against the live API, 43 seasons, not one date. So
// this file is the only source the countdown has, and a wrong number in it
// reaches the homepage as a confident "ends in N days".
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "json", "season-dates.json"), "utf8")
);

const entries = () => Object.entries(config.seasons || {});

test("every season entry has dates that parse and run forwards", () => {
  assert.ok(entries().length > 0, "no seasons configured at all");
  for (const [id, season] of entries()) {
    const start = new Date(season.startDate);
    const end = new Date(season.endDate);
    assert.ok(!Number.isNaN(start.getTime()), `${id}: startDate does not parse`);
    assert.ok(!Number.isNaN(end.getTime()), `${id}: endDate does not parse`);
    assert.ok(end > start, `${id}: ends before it starts`);
  }
});

test("an entry only drops the estimated flag when it carries a real end date", () => {
  // getLiveSnapshot reports isEstimated straight to the client, and the
  // homepage prints "~" in front of the countdown when it is set. Claiming a
  // date is official is a claim about where it came from, so the entry has to
  // name a source that is not our own arithmetic.
  for (const [id, season] of entries()) {
    if (season.isEstimated) continue;
    assert.ok(season.endDate, `${id}: not estimated, but has no endDate`);
    assert.ok(season.source, `${id}: not estimated, so it must say where the date came from`);
  }
});

test("no cycle fallback invents an end date", () => {
  // There used to be a defaults.cycleDays here, applied to an entry that had a
  // start but no end. Two seasons have now been measured and they disagree by a
  // month -- 85 days for Season 42, 55 for Season 43 -- so no single cycle
  // length can be within a fortnight of both, and any guess renders on the
  // homepage as a confident "ends in N days" that can be a month wrong.
  //
  // PUBG's /seasons carries no dates, so the honest answer for a season nobody
  // has researched yet is no countdown at all. getSeasonOverride already returns
  // null for a season with no entry, so nothing needs a fallback to degrade to.
  assert.equal(config.defaults?.cycleDays, undefined, "a cycle guess is worse than no countdown");

  const measured = entries()
    .filter(([, s]) => s.startDate && s.endDate && !s.isEstimated)
    .map(([id, s]) => [id, Math.round((new Date(s.endDate) - new Date(s.startDate)) / 86400000)]);

  // Guards the premise above rather than the numbers: if every measured season
  // ever agrees to within a fortnight again, a cycle fallback becomes defensible
  // and this test is the note explaining why it was dropped.
  assert.ok(measured.length >= 2, "need at least two measured seasons to claim they vary");
  const lengths = measured.map(([, days]) => days);
  assert.ok(
    Math.max(...lengths) - Math.min(...lengths) > 14,
    `measured seasons ${JSON.stringify(measured)} agree closely enough that a cycle fallback would be defensible`
  );
});
