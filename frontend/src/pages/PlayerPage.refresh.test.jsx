import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import PlayerPage from "./PlayerPage";

const getPlayerData = vi.fn();
const getPlayerReports = vi.fn();
const getPlayerExtras = vi.fn();
const prefetchMatchReplay = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: (...args) => getPlayerReports(...args),
  getPlayerExtras: (...args) => getPlayerExtras(...args),
  prefetchMatchReplay: (...args) => prefetchMatchReplay(...args),
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

const T0 = 1_700_000_000_000;
let nowSpy;

beforeEach(() => {
  getPlayerData.mockReset();
  getPlayerReports.mockReset();
  getPlayerExtras.mockReset();
  prefetchMatchReplay.mockReset();
  getPlayerReports.mockResolvedValue({ data: { summary: {}, encounters: [] } });
  getPlayerExtras.mockResolvedValue({ data: null });
  prefetchMatchReplay.mockResolvedValue({ data: {} });
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
  nowSpy.mockRestore();
  setVisibility("visible");
});

const payload = () => ({
  data: {
    data: {
      platformInfo: { platformSlug: "steam", platformUserId: "account.PlayerA", platformUserHandle: "PlayerA" },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: { items: [], summary: { total: 0 } },
      profile: { status: "deferred" },
    },
  },
});

const renderPage = async () => {
  getPlayerData.mockResolvedValue(payload());
  render(
    <MemoryRouter initialEntries={["/player/steam/PlayerA"]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText("PlayerA");
};

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

// What a player actually does: leaves the tab open, plays a match, comes back.
const leaveAndReturnAfter = (ms) => {
  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  nowSpy.mockReturnValue(T0 + ms);
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("coming back to the tab after a minute away asks the API for fresh data", async () => {
  await renderPage();
  expect(getPlayerData).toHaveBeenCalledTimes(1);

  leaveAndReturnAfter(61_000);

  await waitFor(() => expect(getPlayerData).toHaveBeenCalledTimes(2));
});

test("a glance away and straight back asks for nothing", async () => {
  // The backend records at most one RP reading a minute, so a faster round trip
  // buys nothing and only spends PUBG quota.
  await renderPage();

  leaveAndReturnAfter(10_000);
  await settle();

  expect(getPlayerData).toHaveBeenCalledTimes(1);
});

test("the refresh on return never blanks the page into the loading skeleton", async () => {
  await renderPage();
  getPlayerData.mockImplementation(() => new Promise(() => {}));

  leaveAndReturnAfter(61_000);
  await waitFor(() => expect(getPlayerData).toHaveBeenCalledTimes(2));

  expect(screen.getByText("PlayerA")).toBeInTheDocument();
  expect(screen.queryByText(en.pages.player.loading)).not.toBeInTheDocument();
});
