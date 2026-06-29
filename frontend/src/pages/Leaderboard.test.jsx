import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Leaderboard from "./Leaderboard";

const getLeaderboard = vi.fn();
const getSeasons = vi.fn();
const navigate = vi.fn();

vi.mock("../api/leaderboard", () => ({
  getLeaderboard: (...args) => getLeaderboard(...args),
  getSeasons: (...args) => getSeasons(...args),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

const t = (k) => k;

const sampleEntries = [
  { rank: 1, accountId: "account.a", name: "Alpha", rankPoints: 6000, games: 100, wins: 20, winRatio: 0.2, kda: 5.5, avgRank: 4.2, avgKills: 6.1, avgDamage: 520, kills: 400 },
  { rank: 2, accountId: "account.b", name: "Bravo", rankPoints: 5200, games: 80, wins: 9, winRatio: 0.1125, kda: 4.1, avgRank: 7.0, avgKills: 3.4, avgDamage: 410, kills: 250 },
];

beforeEach(() => {
  getLeaderboard.mockReset();
  getSeasons.mockReset();
  navigate.mockReset();
  getSeasons.mockResolvedValue({ status: 200, data: { seasons: [{ id: "s-current", label: "Season 30" }], currentSeasonId: "s-current" } });
  getLeaderboard.mockResolvedValue({ status: 200, data: { platform: "pc-eu", gameMode: "squad-fpp", seasonId: "s-current", entries: sampleEntries } });
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

test("filters rows by the debounced player search box", async () => {
  renderPage();
  await screen.findByText("Alpha");
  fireEvent.change(screen.getByPlaceholderText("pages.leaderboards.search"), { target: { value: "alp" } });
  await waitFor(() => {
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
  });
  expect(screen.getByText("Alpha")).toBeInTheDocument();
});

test("refetches when the game mode changes", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const soloRadio = screen.getByText("solo", { selector: "*" });
  fireEvent.click(soloRadio);
  await waitFor(() => {
    expect(getLeaderboard).toHaveBeenLastCalledWith("pc-eu", "solo", "s-current");
  });
});

test("refetches when the refresh button is clicked", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const before = getLeaderboard.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "pages.leaderboards.refresh" }));
  await waitFor(() => {
    expect(getLeaderboard.mock.calls.length).toBeGreaterThan(before);
  });
});

test("navigates to compare with the selected players", async () => {
  renderPage();
  await screen.findByText("Alpha");
  const checkboxes = screen.getAllByRole("checkbox");
  // checkboxes[0] is the header select-all; rows start at index 1
  fireEvent.click(checkboxes[1]);
  fireEvent.click(checkboxes[2]);
  const compareBtn = await screen.findByRole("button", { name: /pages.leaderboards.compare/ });
  fireEvent.click(compareBtn);
  await waitFor(() => {
    expect(navigate).toHaveBeenCalled();
  });
  const dest = navigate.mock.calls[0][0];
  expect(dest).toContain("/compare?");
  expect(dest).toContain("steam%3AAlpha");
  expect(dest).toContain("steam%3ABravo");
});
