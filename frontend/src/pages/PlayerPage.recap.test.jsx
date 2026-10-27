import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import PlayerPage from "./PlayerPage";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const getPlayerData = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: () => Promise.resolve({ data: { summary: {}, encounters: [] } }),
  getPlayerExtras: () => Promise.resolve({ data: null }),
  prefetchMatchReplay: () => Promise.resolve({ data: {} }),
  locatePlayer: () => Promise.resolve({ data: { found: [], suggestions: [], complete: false } }),
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
      platformInfo: { platformSlug: "steam", platformUserId: "account.x", platformUserHandle: "Someone" },
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
});
