import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import PlayerPage from "./PlayerPage";

const getPlayerData = vi.fn();
const getPlayerReports = vi.fn();
const getPlayerExtras = vi.fn();
const addHistory = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: (...args) => getPlayerReports(...args),
  getPlayerExtras: (...args) => getPlayerExtras(...args),
}));

vi.mock("../cookie/store", () => ({
  FAVORITES_UPDATED_EVENT: "favorites:updated",
  addHistory: (...args) => addHistory(...args),
  isFavorite: () => Promise.resolve(false),
  toggleFavorite: () => Promise.resolve({ favorited: false }),
}));

vi.mock("./MapsTab", () => ({ default: () => <div data-testid="maps-tab" /> }));
vi.mock("../component/Notification", () => ({ default: () => {} }));

beforeEach(() => {
  getPlayerData.mockReset();
  getPlayerReports.mockReset();
  getPlayerExtras.mockReset();
  addHistory.mockReset();
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

const rankPayload = (handle) => ({
  data: {
    data: {
      platformInfo: {
        platformSlug: "steam",
        platformUserId: `account.${handle}`,
        platformUserHandle: handle,
      },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: { items: [], summary: {} },
      profile: {},
    },
  },
});

const reportsPayload = (killer) => ({
  data: {
    summary: { total: 1, kills: 1, deaths: 0 },
    encounters: [
      {
        id: `${killer}-1`,
        type: "kill",
        killer,
        victim: "SomeVictim",
        map: "Erangel",
        mode: "squad-fpp",
        distance: 42,
        timeDiff: "00:00:12",
        timeEvent: "2026-07-01T10:00:00.000Z",
      },
    ],
  },
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const Nav = () => {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" data-testid="go-b" onClick={() => navigate("/player/steam/PlayerB")}>
        go b
      </button>
      <button type="button" data-testid="go-xbox-b" onClick={() => navigate("/player/xbox/PlayerB")}>
        go xbox b
      </button>
    </>
  );
};

const renderAt = (path = "/player/steam/PlayerA") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
      <Nav />
    </MemoryRouter>
  );

const openReportsTab = () => fireEvent.click(screen.getByRole("tab", { name: "Twitch Reports" }));

test("never requests reports with the previous player's identity after navigating", async () => {
  getPlayerData.mockImplementation((_platform, gameId) => Promise.resolve(rankPayload(gameId)));
  getPlayerReports.mockResolvedValue(reportsPayload("Nobody"));

  renderAt();
  await screen.findByText("PlayerA");
  const callsBeforeNavigation = getPlayerReports.mock.calls.length;

  fireEvent.click(screen.getByTestId("go-b"));
  await screen.findByText("PlayerB");
  await waitFor(() => {
    expect(getPlayerReports).toHaveBeenCalledWith("account.PlayerB", "PlayerB");
  });

  const callsAfterNavigation = getPlayerReports.mock.calls.slice(callsBeforeNavigation);
  expect(callsAfterNavigation.length).toBeGreaterThan(0);
  expect(callsAfterNavigation.map(([accountId]) => accountId)).not.toContain("account.PlayerA");
  expect(callsAfterNavigation.map(([, playerName]) => playerName)).not.toContain("PlayerA");
  expect(callsAfterNavigation).toEqual([[null, "PlayerB"], ["account.PlayerB", "PlayerB"]]);
});

test("ignores a late reports response for the previous player", async () => {
  const stale = deferred();
  getPlayerData.mockImplementation((_platform, gameId) => Promise.resolve(rankPayload(gameId)));
  getPlayerReports.mockImplementation((accountId, playerName) =>
    `${accountId} ${playerName}`.includes("PlayerA")
      ? stale.promise
      : Promise.resolve(reportsPayload("BravoKiller"))
  );

  renderAt();
  await screen.findByText("PlayerA");

  fireEvent.click(screen.getByTestId("go-b"));
  await screen.findByText("PlayerB");

  openReportsTab();
  expect(await screen.findByText("BravoKiller")).toBeInTheDocument();

  stale.resolve(reportsPayload("AlphaKiller"));
  await flush();

  expect(screen.getByText("BravoKiller")).toBeInTheDocument();
  expect(screen.queryByText("AlphaKiller")).not.toBeInTheDocument();
});

test("ignores a late reports rejection for the previous player", async () => {
  const stale = deferred();
  getPlayerData.mockImplementation((_platform, gameId) => Promise.resolve(rankPayload(gameId)));
  getPlayerReports.mockImplementation((accountId, playerName) =>
    `${accountId} ${playerName}`.includes("PlayerA")
      ? stale.promise
      : Promise.resolve(reportsPayload("BravoKiller"))
  );

  renderAt();
  await screen.findByText("PlayerA");

  fireEvent.click(screen.getByTestId("go-b"));
  await screen.findByText("PlayerB");

  openReportsTab();
  expect(await screen.findByText("BravoKiller")).toBeInTheDocument();

  stale.reject(new Error("stale reports failure"));
  await flush();

  expect(screen.getByText("BravoKiller")).toBeInTheDocument();
  expect(screen.queryByText("stale reports failure")).not.toBeInTheDocument();
});

test("does not record the previous player under the new route's platform", async () => {
  getPlayerData.mockImplementation((_platform, gameId) => Promise.resolve(rankPayload(gameId)));
  getPlayerReports.mockResolvedValue(reportsPayload("Nobody"));

  renderAt();
  await screen.findByText("PlayerA");
  addHistory.mockClear();

  fireEvent.click(screen.getByTestId("go-xbox-b"));
  await screen.findByText("PlayerB");
  await flush();

  const phantom = addHistory.mock.calls.find(([platform, gameId]) => platform === "xbox" && gameId === "PlayerA");
  expect(phantom).toBeUndefined();
  expect(addHistory).toHaveBeenCalledWith("xbox", "PlayerB", "PlayerB", null, null, null, null);
});
