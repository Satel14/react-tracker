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

test("the cycle fallback is a plausible season length", () => {
  // Used only when a season has no entry: startDate + cycleDays. It is a guess
  // by construction, but a guess that disagrees with the seasons we have
  // actually measured is worse than none -- it renders as a countdown.
  const measured = entries()
    .filter(([, s]) => s.startDate && s.endDate && !s.isEstimated)
    .map(([, s]) => Math.round((new Date(s.endDate) - new Date(s.startDate)) / 86400000));

  const cycleDays = Number(config.defaults?.cycleDays);
  assert.ok(cycleDays > 0, "cycleDays must be positive");

  for (const days of measured) {
    // Within a fortnight of every season whose real length we know.
    assert.ok(
      Math.abs(days - cycleDays) <= 14,
      `cycleDays ${cycleDays} is ${Math.abs(days - cycleDays)} days off a measured season of ${days}`
    );
  }
});
