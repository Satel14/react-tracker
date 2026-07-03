import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import MatchReplayPage from "./MatchReplayPage";
import { getMatchAnalysis } from "../api/player";

vi.mock("../api/player", () => ({
  getMatchReplay: vi.fn(() =>
    Promise.resolve({
      data: {
        matchId: "m1", rawMapName: "Baltic_Main", mapName: "Erangel", mapMax: 8160, duration: 100,
        players: [{ name: "Me", accountId: "account.me", teamId: 1, isFocal: true, positions: [{ t: 0, x: 10, y: 10 }], deathTime: null }],
        kills: [],
        zones: [],
      },
    })
  ),
  getMatchAnalysis: vi.fn(() =>
    Promise.resolve({
      data: {
        scoreboard: { teams: [{ rank: 1, teamId: 1, won: true, isFocalTeam: true, players: [
          { name: "ScoreboardGuy", accountId: "account.sg", kills: 2, damageDealt: 200, assists: 0, DBNOs: 0, headshotKills: 0, timeSurvived: 100, isFocal: true },
        ] }] },
        killFeed: [], damage: null, timeline: null,
        focalAccountId: "account.sg", rawMapName: "Baltic_Main", mapMax: 8160, duration: 100,
      },
    })
  ),
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/match/:platform/:matchId/replay" element={<MatchReplayPage />} />
      </Routes>
    </MemoryRouter>
  );

test("renders the real map after loading replay data", async () => {
  renderAt("/match/steam/m1/replay");
  const img = await screen.findByRole("img", { name: /erangel/i });
  expect(img).toBeInTheDocument();
});

test("shows playback controls after load", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  expect(screen.getByText("pages.replay.play")).toBeInTheDocument();
});

test("clicking play switches the button to pause", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  fireEvent.click(screen.getByText("pages.replay.play"));
  expect(screen.getByText("pages.replay.pause")).toBeInTheDocument();
});

test("shows the roster with player names after load", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  expect(screen.getByText("Me")).toBeInTheDocument();
});

test("clicking a roster row marks it selected", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const row = screen.getByRole("button", { name: /Me/ });
  fireEvent.click(row);
  expect(row.className).toMatch(/is-selected/);
});

test("shows a back-to-profile link pointing at the player page", () => {
  renderAt("/match/steam/m1/replay?playerName=Me&accountId=account.me");
  const back = screen.getByRole("link", { name: "pages.replay.back" });
  expect(back).toHaveAttribute("href", "/player/steam/Me");
});

test("switching to the Scoreboard tab loads and renders analysis", async () => {
  renderAt("/match/steam/m1/replay?accountId=account.me");
  await screen.findByRole("img", { name: /erangel/i });
  fireEvent.click(screen.getByRole("tab", { name: "pages.match.tabScoreboard" }));
  expect(await screen.findByText("ScoreboardGuy")).toBeInTheDocument();
});

test("re-fetches analysis when the match identity changes while a non-replay tab is active", async () => {
  getMatchAnalysis.mockImplementation((id) =>
    Promise.resolve({
      data: {
        scoreboard: { teams: [{ rank: 1, teamId: 1, won: true, isFocalTeam: true, players: [
          { name: id === "m2" ? "SecondMatchGuy" : "ScoreboardGuy", accountId: "account.sg", kills: 2, damageDealt: 200, assists: 0, DBNOs: 0, headshotKills: 0, timeSurvived: 100, isFocal: true },
        ] }] },
        killFeed: [], damage: null, timeline: null,
        focalAccountId: "account.sg", rawMapName: "Baltic_Main", mapMax: 8160, duration: 100,
      },
    })
  );

  const Harness = () => {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate("/match/steam/m2/replay?accountId=account.me")}>go-m2</button>
        <Routes>
          <Route path="/match/:platform/:matchId/replay" element={<MatchReplayPage />} />
        </Routes>
      </>
    );
  };

  render(
    <MemoryRouter initialEntries={["/match/steam/m1/replay?accountId=account.me"]}>
      <Harness />
    </MemoryRouter>
  );

  await screen.findByRole("img", { name: /erangel/i });
  fireEvent.click(screen.getByRole("tab", { name: "pages.match.tabScoreboard" }));
  expect(await screen.findByText("ScoreboardGuy")).toBeInTheDocument();

  fireEvent.click(screen.getByText("go-m2"));
  expect(await screen.findByText("SecondMatchGuy")).toBeInTheDocument();
});
