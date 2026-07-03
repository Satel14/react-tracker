import { shouldRecordHistory } from "./playerHistory";

const SEASONS = [
  { id: "season-30", label: "Season 30", isCurrentSeason: true },
  { id: "season-29", label: "Season 29", isCurrentSeason: false },
];

test("records history for the default load when no season is active", () => {
  expect(shouldRecordHistory({ activeSeasonId: null, seasons: SEASONS })).toBe(true);
});

test("records history when the active season is the current season", () => {
  expect(shouldRecordHistory({ activeSeasonId: "season-30", seasons: SEASONS })).toBe(true);
});

test("does NOT record history when viewing a non-current season", () => {
  expect(shouldRecordHistory({ activeSeasonId: "season-29", seasons: SEASONS })).toBe(false);
});

test("records history when the season catalog is empty or missing", () => {
  expect(shouldRecordHistory({ activeSeasonId: "season-29", seasons: [] })).toBe(true);
  expect(shouldRecordHistory({ activeSeasonId: "season-29" })).toBe(true);
});

test("records history when no current season can be identified in the catalog", () => {
  const seasons = [{ id: "season-29", label: "Season 29", isCurrentSeason: false }];
  expect(shouldRecordHistory({ activeSeasonId: "season-29", seasons })).toBe(true);
});

test("tolerates being called with no arguments", () => {
  expect(shouldRecordHistory()).toBe(true);
});
