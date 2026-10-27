import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import PlayerPage from "./PlayerPage";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const getPlayerData = vi.fn();
const checkPcLauncher = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: () => Promise.resolve({ data: { summary: {}, encounters: [] } }),
  getPlayerExtras: () => Promise.resolve({ data: null }),
  prefetchMatchReplay: () => Promise.resolve({ data: {} }),
  locatePlayer: () => Promise.resolve({ data: { found: [], suggestions: [], complete: false } }),
  checkPcLauncher: (...args) => checkPcLauncher(...args),
}));

vi.mock("../api/census", () => ({
  getRankDistribution: () => Promise.resolve({ data: null }),
  default: () => Promise.resolve({ data: null }),
}));

vi.mock("../cookie/store", () => ({
  FAVORITES_UPDATED_EVENT: "favorites:updated",
  addHistory: () => {},
  isFavorite: () => Promise.resolve(false),
  toggleFavorite: () => Promise.resolve({ favorited: false }),
}));

vi.mock("./MapsTab", () => ({ default: () => <div data-testid="maps-tab" /> }));
vi.mock("../component/Notification", () => ({ default: () => {} }));

const S44 = "division.bro.official.pc-2018-44";
const S43 = "division.bro.official.pc-2018-43";
const stat = (value) => ({ value, displayValue: String(value) });

const payload = (seasonId) => ({
  data: {
    data: {
      platformInfo: { platformSlug: "steam", platformUserId: "account.3cc264b9e6754f459de7caf048f700b7", platformUserHandle: "Someone" },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [
        { id: S44, seasonNumber: 44, label: "Season #44", isCurrentSeason: true },
        { id: S43, seasonNumber: 43, label: "Season #43", isCurrentSeason: false },
      ],
      currentSeasonId: S44,
      selectedSeasonId: seasonId,
      season: {
        id: seasonId,
        isCurrentSeason: seasonId === S44,
        rankedInfo: { tier: "Gold", label: "Gold I", currentRankPoint: 2100, bestRankPoint: 2200, avgRank: 11 },
        stats: {},
        breakdown: { ranked: { matchesPlayed: stat(40), wins: stat(2), top10Rate: stat(35), kd: stat(1.4), avgDamage: stat(250) }, normal: null },
      },
      matches: { items: [], summary: { total: 0 } },
      profile: {},
    },
  },
});

beforeEach(() => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("en");
  getPlayerData.mockReset();
  checkPcLauncher.mockReset();
  checkPcLauncher.mockResolvedValue({ status: 200, data: { platform: "kakao", matches: 71 } });
  getPlayerData.mockImplementation((_platform, _gameId, seasonId) => Promise.resolve(payload(seasonId || S44)));
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  window.ResizeObserver = window.ResizeObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  setTranslations({});
  setDefaultLanguage("en");
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );

test("the recap of the season on screen opens the profile", async () => {
  renderAt("/player/steam/Someone");
  expect(await screen.findByRole("heading", { name: "Season 44 so far" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download image" })).toBeInTheDocument();
});

test("the previous season's recap is one click away, through the season the page already loads", async () => {
  renderAt("/player/steam/Someone");
  fireEvent.click(await screen.findByRole("button", { name: "Season 43 recap →" }));

  await waitFor(() => expect(getPlayerData).toHaveBeenLastCalledWith("steam", "Someone", S43));
  expect(await screen.findByRole("heading", { name: "Season 43 · final" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "← Season 44" }));
  await waitFor(() => expect(getPlayerData).toHaveBeenLastCalledWith("steam", "Someone", S44));
  expect(await screen.findByRole("heading", { name: "Season 44 so far" })).toBeInTheDocument();
});

// The account id the hint sends is the one the profile payload carries.
test("an empty Steam profile of a Kakao player points to the Kakao profile", async () => {
  renderAt("/player/steam/Someone");
  expect(await screen.findByRole("link", { name: "Open the Kakao profile →" })).toHaveAttribute("href", "/player/kakao/Someone");
  expect(checkPcLauncher).toHaveBeenCalledWith("steam", "account.3cc264b9e6754f459de7caf048f700b7");
});

test("a profile with recent matches does not ask where else it plays", async () => {
  getPlayerData.mockImplementation(() => {
    const full = payload(S44);
    full.data.data.matches = { items: [{ id: "m1" }], summary: { total: 1 } };
    return Promise.resolve(full);
  });
  renderAt("/player/steam/Someone");
  await screen.findByRole("heading", { name: "Season 44 so far" });
  expect(checkPcLauncher).not.toHaveBeenCalled();
});
