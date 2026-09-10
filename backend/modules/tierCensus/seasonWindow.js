// Which season a sample day should be measured against.
//
// The census reads a tier out of one named season's ladder, but the matches it
// draws players from are two days old. Every day of the year those are the
// same season and this module says so. On the two days around a reset they are
// not, and getting it wrong is not a rounding error: asking PUBG for a
// player's standing in a season that opened this morning answers "unranked"
// for everyone drawn from yesterday's lobbies, which stores a full day of
// sample as a measurement of nobody having placed yet.
//
// Pure on purpose. The dates come from json/season-dates.json, which the
// countdown already depends on and a person already updates every rollover.

const seasonDates = require("../../json/season-dates.json");

const dayOf = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

// The start of the season a run is about to measure, or null when the file has
// nothing to say about it.
const seasonStartDate = (seasonId) => seasonDates?.seasons?.[seasonId]?.startDate ?? null;

// The catalog arrives sorted, but sorted by the caller rather than by PUBG, so
// this reads the numbers rather than trusting the order.
const previousSeasonId = (catalog) => {
  const current = (catalog?.seasons ?? []).find((season) => season?.id === catalog?.currentSeasonId);
  if (!Number.isFinite(current?.seasonNumber)) return null;

  const below = (catalog.seasons ?? []).filter(
    (season) => Number.isFinite(season?.seasonNumber) && season.seasonNumber < current.seasonNumber,
  );
  if (!below.length) return null;

  return below.reduce((best, season) => (season.seasonNumber > best.seasonNumber ? season : best)).id;
};

const seasonForWindow = ({ windowDate, currentSeasonId, previousSeasonId: previous = null, startDate }) => {
  const day = dayOf(windowDate);
  if (!day) return null;

  const startDay = dayOf(startDate);
  // Nothing to compare against. Carrying on as before is wrong for two days
  // every three months; stopping would be wrong until somebody noticed.
  if (!startDay) return currentSeasonId ?? null;

  if (day > startDay) return currentSeasonId ?? null;
  // The opening day itself straddles the maintenance, and a calendar day is the
  // finest cut PUBG's sample offers, so neither season owns it.
  if (day === startDay) return null;
  return previous ?? null;
};

module.exports = { seasonForWindow, previousSeasonId, seasonStartDate };
