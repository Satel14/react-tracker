import { resolveHistoryCandidate, shouldRecordHistory } from "./playerHistory";

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

describe("resolveHistoryCandidate", () => {
  const ACCOUNT_ID = "account.fa405e76bea343a59dc8bc4d3cece7a6";
  const loadedData = {
    platformInfo: {
      platformUserId: ACCOUNT_ID,
      platformUserHandle: "Neo",
      platformSlug: "steam",
      avatarUrl: "https://cdn.example/neo.jpg",
    },
    season: {
      id: "season-30",
      rankedInfo: { iconUrl: "gold.png", iconFallbackUrl: null, label: "Gold 1", currentRankPoint: 3000 },
    },
    seasons: [{ id: "season-30", isCurrentSeason: true }],
  };

  test("returns null before the API payload arrives", () => {
    expect(resolveHistoryCandidate({ data: null, routeGameId: ACCOUNT_ID, routePlatform: "steam" })).toBeNull();
    expect(resolveHistoryCandidate({ data: {}, routeGameId: "Neo", routePlatform: "steam" })).toBeNull();
  });

  test("returns null when both the API handle and the route id are account ids", () => {
    const data = {
      ...loadedData,
      platformInfo: { ...loadedData.platformInfo, platformUserHandle: ACCOUNT_ID },
    };
    expect(resolveHistoryCandidate({ data, routeGameId: ACCOUNT_ID, routePlatform: "steam" })).toBeNull();
  });

  test("resolves the proper handle when the route param is an account id", () => {
    const candidate = resolveHistoryCandidate({ data: loadedData, routeGameId: ACCOUNT_ID, routePlatform: "steam" });
    expect(candidate).toEqual({
      platform: "steam",
      gameId: "Neo",
      nickname: "Neo",
      avatar: "https://cdn.example/neo.jpg",
      rankIconUrl: "gold.png",
      rankLabel: "Gold 1",
      rating: 3000,
    });
  });

  test("returns null when viewing a non-current season", () => {
    const data = {
      ...loadedData,
      season: { ...loadedData.season, id: "season-29" },
      seasons: [{ id: "season-30", isCurrentSeason: true }],
    };
    expect(resolveHistoryCandidate({ data, routeGameId: "Neo", routePlatform: "steam" })).toBeNull();
  });

  test("falls back to platformSlug when no route platform is given", () => {
    const candidate = resolveHistoryCandidate({ data: loadedData, routeGameId: "Neo", routePlatform: null });
    expect(candidate?.platform).toBe("steam");
  });
});
