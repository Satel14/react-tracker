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

test("renders an exact gain in the up colour and a loss in the down colour", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "gain", rpDelta: { kind: "exact", value: 23 } }),
    matchItem({ id: "loss", rpDelta: { kind: "exact", value: -15 } }),
  ]);
  const rows = rowsOf(card);

  const gain = within(rows[0]).getByText("+23");
  expect(gain.closest(".player-rp-delta")).toHaveClass("player-rp-delta--up");
  const loss = within(rows[1]).getByText("-15");
  expect(loss.closest(".player-rp-delta")).toHaveClass("player-rp-delta--down");
  expect(card.querySelector(".player-rp-summary")).toBeNull();
});

test("shows a group total in the header and keeps grouped rows at a dash", async () => {
  const since = Date.parse("2026-08-26T18:00:00Z");
  const group = { kind: "group", value: 37, matches: 3 };
  const card = await renderMatchesCard(
    [matchItem({ id: "a", rpDelta: group }), matchItem({ id: "b", rpDelta: group }), matchItem({ id: "c", rpDelta: group })],
    { rankPoints: { ...group, since } }
  );

  const summary = card.querySelector(".player-rp-summary");
  expect(summary).toHaveTextContent(/\+37 RP across 3 ranked matches since /);
  expect(within(card).getAllByText("—")).toHaveLength(3);

  const tooltip = await hoverHint(rowsOf(card)[0]);
  expect(tooltip).toHaveTextContent("Part of +37 RP across 3 ranked matches.");
});

test("shows an adjustment line when RP moved with no ranked matches", async () => {
  const card = await renderMatchesCard([matchItem({ id: "n", matchType: "official" })], {
    rankPoints: { kind: "adjustment", value: -100, matches: 0, since: Date.parse("2026-08-20T18:00:00Z") },
  });
  expect(card.querySelector(".player-rp-summary")).toHaveTextContent(/-100 RP with no ranked matches since /);
});

test("explains noBaseline, pending and unattributed rows on hover", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "nb", rpDelta: { kind: "noBaseline" } }),
    matchItem({ id: "pd", rpDelta: { kind: "pending" } }),
    matchItem({ id: "un", rpDelta: { kind: "unattributed" } }),
  ]);
  const rows = rowsOf(card);
  const texts = en.pages.player.matches;

  const hoverLast = async (row) => {
    fireEvent.mouseEnter(within(row).getByLabelText(texts.rpHint));
    const tooltips = await screen.findAllByRole("tooltip");
    return tooltips[tooltips.length - 1];
  };

  expect(await hoverLast(rows[0])).toHaveTextContent(texts.rpTooltipNoBaseline);
  fireEvent.mouseLeave(within(rows[0]).getByLabelText(texts.rpHint));
  expect(await hoverLast(rows[1])).toHaveTextContent(texts.rpTooltipPending);
  fireEvent.mouseLeave(within(rows[1]).getByLabelText(texts.rpHint));
  expect(await hoverLast(rows[2])).toHaveTextContent(texts.rpTooltipUnattributed);
});
