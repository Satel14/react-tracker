import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import MatchReplayPage from "./MatchReplayPage";
import { getMatchAnalysis, getMatchReplay } from "../api/player";

vi.mock("../api/player", () => ({
  getMatchReplay: vi.fn(() =>
    Promise.resolve({
      data: {
        matchId: "m1", rawMapName: "Baltic_Main", mapName: "Erangel", mapMax: 8160, duration: 100,
        focalAccountId: "account.me", focalTeamId: 1, totalPlayers: 1, totalTeams: 1,
        players: [{ name: "Me", accountId: "account.me", teamId: 1, isFocal: true, positions: [{ t: 0, x: 10, y: 10 }], deathTime: null, dropTime: null }],
        kills: [],
        zones: [{ t: 0, bx: 0, by: 0, br: 100, wx: 0, wy: 0, wr: 100, phase: 1 }],
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
  // The name appears twice by design since the HUD landed: once in the focal
  // squad overlay on the map, once in the roster below it.
  expect(document.querySelector(".replay-overlay__member-name").textContent).toBe("Me");
  expect(document.querySelector(".replay-roster__name").textContent).toBe("Me");
});

test("decodes compact replay positions before rendering", async () => {
  getMatchReplay.mockResolvedValueOnce({
    data: {
      format: 2,
      matchId: "m1",
      rawMapName: "Baltic_Main",
      mapName: "Erangel",
      mapMax: 8160,
      duration: 100,
      players: [{
        name: "Compressed Player",
        accountId: "account.compact",
        teamId: 1,
        positions: { t: [0, 10], x: [10, 5], y: [20, -5], h: [100, 80], f: [0, 1] },
        deathTime: null,
        dropTime: null,
      }],
      kills: [],
      zones: [],
      shots: { t: [], a: [], v: [], ax: [], ay: [], vx: [], vy: [], dmg: [] },
    },
  });

  renderAt("/match/steam/m1/replay");

  expect(await screen.findByText("Compressed Player")).toBeInTheDocument();
});

test("clicking a roster row toggles its selection", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const row = screen.getByRole("button", { name: /Me/ });
  // The fixture's only player is the focal one, so the replay opens with them
  // already selected. Click once to clear, once more to select again -- which
  // is the toggle this test has always been about.
  fireEvent.click(row);
  expect(row.className).not.toMatch(/is-selected/);
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

test("shows the speed label and a reset-view control", async () => {
  renderAt("/match/steam/m1/replay");
  expect(await screen.findByRole("img", { name: /erangel/i })).toBeInTheDocument();
  expect(screen.getByText("pages.replay.speed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "pages.replay.resetView" })).toBeInTheDocument();
});

test("Space does not toggle playback while a text input has focus", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  fireEvent.keyDown(input, { code: "Space" });
  expect(screen.getByText("pages.replay.play")).toBeInTheDocument();
  input.remove();
});

test("Space does not toggle playback while a non-replay tab is active", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  fireEvent.click(screen.getByText("pages.match.tabScoreboard"));
  fireEvent.keyDown(window, { code: "Space" });
  fireEvent.click(screen.getByText("pages.match.tabReplay"));
  expect(await screen.findByText("pages.replay.play")).toBeInTheDocument();
});

test("scrubs against the in-game span, not the wall-clock duration", async () => {
  // duration is wall-clock seconds off the match record; endTime is the in-game
  // span. They differ by 5-19 s on every real match because the clocks drift,
  // and scrubbing on duration leaves the tail as dead air.
  getMatchReplay.mockResolvedValueOnce({
    data: {
      format: 2,
      matchId: "m1", rawMapName: "Baltic_Main", mapName: "Erangel", mapMax: 8160,
      duration: 100, endTime: 88,
      players: [{
        name: "Me", accountId: "account.me", teamId: 1,
        positions: { t: [0, 10], x: [10, 5], y: [20, -5], h: [100, 80], f: [0, 0] },
        deathTime: null, dropTime: null,
      }],
      kills: [], zones: [],
      shots: { t: [], a: [], v: [], ax: [], ay: [], vx: [], vy: [], dmg: [] },
    },
  });

  renderAt("/match/steam/m1/replay");
  await screen.findAllByText("Me");
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "88");
  // 88 s renders as 1:28, so the readout tracks the same span as the slider.
  expect(document.querySelector(".match-replay__time").textContent).toBe("00:00 / 01:28");
});

test("falls back to duration when a legacy payload carries no endTime", async () => {
  getMatchReplay.mockResolvedValueOnce({
    data: {
      matchId: "m1", rawMapName: "Baltic_Main", mapName: "Erangel", mapMax: 8160,
      duration: 100,
      players: [{
        name: "Me", accountId: "account.me", teamId: 1,
        positions: [{ t: 0, x: 10, y: 20 }, { t: 10, x: 15, y: 15 }],
        deathTime: null, dropTime: null,
      }],
      kills: [], zones: [],
    },
  });

  renderAt("/match/steam/m1/replay");
  await screen.findAllByText("Me");
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "100");
});

test("shortcuts work without first clicking the map", async () => {
  // The hint is printed page-wide, so the shortcuts have to be page-wide too:
  // they used to need focus on a div nothing ever focused, and entering
  // fullscreen or clicking a control silently disabled them.
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const slider = screen.getByRole("slider");
  expect(slider).toHaveAttribute("aria-valuenow", "0");
  fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "5");
  fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft", shiftKey: true });
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
});

test("shortcuts stay out of the way of typing and of chords", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const input = document.createElement("input");
  document.body.appendChild(input);
  fireEvent.keyDown(input, { key: "ArrowRight", code: "ArrowRight" });
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight", ctrlKey: true });
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  input.remove();
});

test("every shortcut the hint promises actually works", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const at = () => Number(screen.getByRole("slider").getAttribute("aria-valuenow"));

  fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight", shiftKey: true });
  expect(at()).toBe(30);
  fireEvent.keyDown(window, { key: ".", code: "Period" });
  expect(at()).toBe(40);
  fireEvent.keyDown(window, { key: ",", code: "Comma" });
  expect(at()).toBe(30);
  // Clamps at both ends rather than running negative or past the end.
  fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft", shiftKey: true });
  expect(at()).toBe(0);
  fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft" });
  expect(at()).toBe(0);
});

test("digit keys move the speed control the user can see", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  // Physical key: on the Ukrainian layout e.key would be a Cyrillic letter.
  fireEvent.keyDown(window, { key: "й", code: "Digit3" });
  expect(document.querySelector(".ant-segmented-item-selected").textContent).toBe("8×");
});

test("Space plays and pauses", async () => {
  renderAt("/match/steam/m1/replay");
  await screen.findByRole("img", { name: /erangel/i });
  const label = () => document.querySelector(".match-replay__controls .ant-btn").textContent;
  const before = label();
  fireEvent.keyDown(window, { key: " ", code: "Space" });
  expect(label()).not.toBe(before);
});

test("the searched player is selected as soon as the replay loads", async () => {
  // You arrive here from your own profile, so the one player you are certainly
  // interested in is yourself. Leaving nothing selected made the viewer hunt
  // for their own dot among sixty.
  renderAt("/match/steam/m1/replay?accountId=account.me");
  await screen.findByRole("img", { name: /erangel/i });
  const row = document.querySelector(".replay-roster__row.is-selected");
  expect(row).not.toBeNull();
  expect(row.getAttribute("data-account")).toBe("account.me");
});

test("selecting someone else, then deselecting, does not snap back to the focal player", async () => {
  // The default is a starting point, not a floor: re-clicking a row has always
  // meant "select nobody" and must keep meaning it.
  renderAt("/match/steam/m1/replay?accountId=account.me");
  await screen.findByRole("img", { name: /erangel/i });
  const mine = document.querySelector('.replay-roster__row[data-account="account.me"]');
  fireEvent.click(mine);
  expect(document.querySelector(".replay-roster__row.is-selected")).toBeNull();
});

test("a re-render from above does not tear the map down", async () => {
  // The real mechanism behind "the map resets to reset view on its own":
  // react-switch-lang's translate HOC builds a fresh `t` on every render
  // (its index.js:150) and re-renders whenever anything above it does. With
  // `t` in the fetch effect's deps, that re-ran the fetch; "start" set
  // loading, loading short-circuited the whole tab tree, and ReplayStage was
  // unmounted and rebuilt with a fresh camera -- throwing away the zoom the
  // viewer had set up, with no input from them at all.
  let bump;
  const Parent = () => {
    const [, setN] = React.useState(0);
    bump = () => setN((n) => n + 1);
    return (
      <MemoryRouter initialEntries={["/match/steam/m1/replay"]}>
        <Routes>
          <Route path="/match/:platform/:matchId/replay" element={<MatchReplayPage />} />
        </Routes>
      </MemoryRouter>
    );
  };
  render(<Parent />);
  const canvas = await screen.findByRole("img", { name: /erangel/i });
  getMatchReplay.mockClear();

  await act(async () => { bump(); });

  // Same DOM node: the stage was never unmounted, so its camera survived.
  expect(screen.getByRole("img", { name: /erangel/i })).toBe(canvas);
  expect(getMatchReplay).not.toHaveBeenCalled();
});

test("a reload of the same match keeps the map on screen", async () => {
  // Defence in depth for the same failure. Even if something does re-trigger
  // the fetch, the loading state must not blank a replay we already have.
  renderAt("/match/steam/m1/replay");
  const canvas = await screen.findByRole("img", { name: /erangel/i });
  fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
  expect(screen.getByRole("img", { name: /erangel/i })).toBe(canvas);
});
