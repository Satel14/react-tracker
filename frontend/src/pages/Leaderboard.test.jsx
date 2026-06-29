import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Leaderboard from "./Leaderboard";

const getLeaderboard = vi.fn();
const getSeasons = vi.fn();

vi.mock("../api/leaderboard", () => ({
  getLeaderboard: (...args) => getLeaderboard(...args),
  getSeasons: (...args) => getSeasons(...args),
}));

const t = (k) => k;

const sampleEntries = [
  { rank: 1, accountId: "account.a", name: "Alpha", rankPoints: 6000, games: 100, wins: 20, winRatio: 0.2, kda: 5.5, avgDamage: 520, kills: 400 },
  { rank: 2, accountId: "account.b", name: "Bravo", rankPoints: 5200, games: 80, wins: 9, winRatio: 0.1125, kda: 4.1, avgDamage: 410, kills: 250 },
];

beforeEach(() => {
  getLeaderboard.mockReset();
  getSeasons.mockReset();
  getSeasons.mockResolvedValue({ status: 200, data: { seasons: [{ id: "s-current", label: "Season 30" }], currentSeasonId: "s-current" } });
  getLeaderboard.mockResolvedValue({ status: 200, data: { platform: "steam", gameMode: "squad-fpp", seasonId: "s-current", entries: sampleEntries } });
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/leaderboards"]}>
      <Leaderboard t={t} />
    </MemoryRouter>
  );

test("renders leaderboard rows from the API", async () => {
  renderPage();
  expect(await screen.findByText("Alpha")).toBeInTheDocument();
  expect(screen.getByText("Bravo")).toBeInTheDocument();
});

test("filters rows by the player search box", async () => {
  renderPage();
  await screen.findByText("Alpha");
  fireEvent.change(screen.getByPlaceholderText("pages.leaderboards.search"), { target: { value: "alp" } });
  expect(screen.getByText("Alpha")).toBeInTheDocument();
  expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
});

test("refetches when the game mode changes", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const soloRadio = screen.getByText("solo", { selector: "*" });
  fireEvent.click(soloRadio);
  await waitFor(() => {
    expect(getLeaderboard).toHaveBeenLastCalledWith("steam", "solo", "s-current");
  });
});
