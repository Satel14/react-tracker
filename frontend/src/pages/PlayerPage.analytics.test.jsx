import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import PlayerPage from "./PlayerPage";

const getPlayerData = vi.fn();
const getPlayerReports = vi.fn();
const getPlayerExtras = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: (...args) => getPlayerReports(...args),
  getPlayerExtras: (...args) => getPlayerExtras(...args),
  prefetchMatchReplay: () => Promise.resolve({ data: {} }),
}));

vi.mock("../cookie/store", () => ({
  FAVORITES_UPDATED_EVENT: "favorites:updated",
  addHistory: () => {},
  isFavorite: () => Promise.resolve(false),
  toggleFavorite: () => Promise.resolve({ favorited: false }),
}));

vi.mock("./MapsTab", () => ({ default: () => <div data-testid="maps-tab" /> }));
vi.mock("../component/Notification", () => ({ default: () => {} }));

const T0 = 1_700_000_000_000;
let nowSpy;

beforeEach(() => {
  getPlayerData.mockReset();
  getPlayerReports.mockReset();
  getPlayerExtras.mockReset();
  getPlayerReports.mockResolvedValue({ data: { summary: {}, encounters: [] } });
  getPlayerExtras.mockResolvedValue({ data: null });
  window.gtag = vi.fn();
  nowSpy = vi.spyOn(Date, "now").mockReturnValue(T0);
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
  delete window.gtag;
  nowSpy.mockRestore();
  setVisibility("visible");
});

const payload = (handle) => ({
  data: {
    data: {
      platformInfo: { platformSlug: "steam", platformUserId: `account.${handle}`, platformUserHandle: handle },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: { items: [], summary: { total: 0 } },
      profile: {},
    },
  },
});

const GoToB = () => {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="go-b" onClick={() => navigate("/player/steam/PlayerB")}>
      go b
    </button>
  );
};

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
      <GoToB />
    </MemoryRouter>
  );

const lookups = () =>
  window.gtag.mock.calls.filter(([kind, name]) => kind === "event" && name === "player_lookup").map(([, , params]) => params);

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

test("a player who loads is reported once, as found, with the platform", async () => {
  getPlayerData.mockResolvedValue(payload("PlayerA"));

  renderAt("/player/steam/PlayerA");
  await screen.findByText("PlayerA");

  expect(lookups()).toEqual([{ platform: "steam", result: "found" }]);
});

test("a console player who does not exist is reported as not_found", async () => {
  getPlayerData.mockRejectedValue(Object.assign(new Error("Player not found"), { status: 422 }));

  renderAt("/player/xbox/Ghost");

  await waitFor(() => expect(lookups()).toEqual([{ platform: "xbox", result: "not_found" }]));
});

test("a failed lookup is reported by its cause", async () => {
  getPlayerData.mockRejectedValue(new Error("Failed to fetch"));

  renderAt("/player/psn/Someone");

  await waitFor(() => expect(lookups()).toEqual([{ platform: "psn", result: "network" }]));
});

test("the platform is reported the way the rest of the app spells it", async () => {
  getPlayerData.mockResolvedValue(payload("PlayerA"));

  renderAt("/player/XBL/PlayerA");
  await screen.findByText("PlayerA");

  expect(lookups()).toEqual([{ platform: "xbox", result: "found" }]);
});

test("opening a second player is a second lookup", async () => {
  getPlayerData.mockImplementation((_platform, gameId) => Promise.resolve(payload(gameId)));

  renderAt("/player/steam/PlayerA");
  await screen.findByText("PlayerA");
  fireEvent.click(screen.getByTestId("go-b"));
  await screen.findByText("PlayerB");

  expect(lookups()).toHaveLength(2);
});

test("the silent refresh on returning to the tab is not a new lookup", async () => {
  getPlayerData.mockResolvedValue(payload("PlayerA"));
  renderAt("/player/steam/PlayerA");
  await screen.findByText("PlayerA");

  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  nowSpy.mockReturnValue(T0 + 61_000);
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await waitFor(() => expect(getPlayerData).toHaveBeenCalledTimes(2));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(lookups()).toHaveLength(1);
});
