import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import PlayerPage from "./PlayerPage";

const getPlayerData = vi.fn();
const getPlayerReports = vi.fn();
const getPlayerExtras = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: (...args) => getPlayerReports(...args),
  getPlayerExtras: (...args) => getPlayerExtras(...args),
}));

vi.mock("../cookie/store", () => ({
  FAVORITES_UPDATED_EVENT: "favorites:updated",
  addHistory: () => {},
  isFavorite: () => Promise.resolve(false),
  toggleFavorite: () => Promise.resolve({ favorited: false }),
}));

vi.mock("./MapsTab", () => ({ default: () => <div data-testid="maps-tab" /> }));
vi.mock("../component/Notification", () => ({ default: () => {} }));

setTranslations({ en, ua });
setDefaultLanguage("en");

beforeEach(() => {
  getPlayerData.mockReset();
  getPlayerReports.mockReset();
  getPlayerExtras.mockReset();
  getPlayerReports.mockResolvedValue({ data: { summary: {}, encounters: [] } });
  getPlayerExtras.mockResolvedValue({ data: null });
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

const matchItem = (overrides = {}) => ({
  id: "m-1",
  createdAt: "2026-08-27T19:46:15Z",
  mapName: "Erangel",
  gameMode: "squad-fpp",
  gameModeLabel: "Squad FPP",
  matchType: "competitive",
  placement: 3,
  isWin: false,
  kills: 5,
  damage: 612,
  assists: 2,
  dbnos: 3,
  survivalTimeLabel: "28:10",
  longestKill: 143,
  teammates: [],
  ...overrides,
});

const payload = (items, summary = {}) => ({
  data: {
    data: {
      platformInfo: { platformSlug: "steam", platformUserId: "account.PlayerA", platformUserHandle: "PlayerA" },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: { items, summary: { total: items.length, ...summary } },
      profile: {},
    },
  },
});

const renderMatchesCard = async (items, summary) => {
  getPlayerData.mockResolvedValue(payload(items, summary));
  render(
    <MemoryRouter initialEntries={["/player/steam/PlayerA"]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText("PlayerA");
  fireEvent.click(screen.getByRole("tab", { name: "Matches" }));
  return screen.getByText("Recent Matches").closest("section");
};

const rowsOf = (card) => card.querySelectorAll(".player-match-item");

const hoverHint = async (row) => {
  fireEvent.mouseEnter(within(row).getByLabelText(en.pages.player.matches.rpHint));
  return screen.findByRole("tooltip");
};

test("marks only competitive rows as Ranked and gives only them an RP cell", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "ranked" }),
    matchItem({ id: "normal", matchType: "official" }),
  ]);
  const rows = rowsOf(card);

  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText(en.pages.player.matches.ranked)).toBeInTheDocument();
  expect(within(rows[1]).queryByText(en.pages.player.matches.ranked)).not.toBeInTheDocument();
  expect(card.querySelectorAll(".player-rp-delta")).toHaveLength(1);
  expect(rows[0].querySelector(".player-match-stats")).toHaveClass("player-match-stats--ranked");
  expect(rows[1].querySelector(".player-match-stats")).not.toHaveClass("player-match-stats--ranked");
});

test("shows a dash with the default explanation when no RP delta is known", async () => {
  const card = await renderMatchesCard([matchItem()]);
  const row = rowsOf(card)[0];

  expect(within(row).getByText("—")).toBeInTheDocument();
  const tooltip = await hoverHint(row);
  expect(tooltip).toHaveTextContent(en.pages.player.matches.rpTooltipDefault);
});
