import React from "react";
import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
  getPlayerData.mockReset();
  getPlayerReports.mockReset();
  getPlayerExtras.mockReset();
  prefetchMatchReplay.mockReset();
  getPlayerReports.mockResolvedValue({ data: { summary: {}, encounters: [] } });
  getPlayerExtras.mockResolvedValue({ data: null });
  prefetchMatchReplay.mockResolvedValue({ data: {} });
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

const payload = (platformInfo) => ({
  data: {
    data: {
      platformInfo: {
        platformSlug: "steam",
        platformUserId: "account.PlayerA",
        platformUserHandle: "PlayerA",
        ...platformInfo,
      },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: { items: [], summary: { total: 0 } },
      profile: { status: "deferred" },
    },
  },
});

const renderPage = async (platformInfo) => {
  getPlayerData.mockResolvedValue(payload(platformInfo));
  render(
    <MemoryRouter initialEntries={["/player/steam/PlayerA"]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText("PlayerA");
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("opening a profile asks pubg.report once, not once on mount and again once the player resolves", async () => {
  await renderPage();
  await settle();

  expect(getPlayerReports).toHaveBeenCalledTimes(1);
});

test("the single reports call carries the resolved account id, not just the name from the URL", async () => {
  await renderPage();
  await settle();

  expect(getPlayerReports).toHaveBeenCalledWith("account.PlayerA", "PlayerA");
});

test("a payload without an account id still asks by name rather than skipping reports", async () => {
  await renderPage({ platformUserId: null });
  await settle();

  expect(getPlayerReports).toHaveBeenCalledTimes(1);
  expect(getPlayerReports).toHaveBeenCalledWith(null, "PlayerA");
});

test("profile extras arriving later do not trigger a second reports call", async () => {
  getPlayerExtras.mockResolvedValue({
    data: { status: "ok", clan: { name: "Clan" }, weaponMastery: null, survivalMastery: null },
  });

  await renderPage();
  await settle();
  await settle();

  expect(getPlayerReports).toHaveBeenCalledTimes(1);
});
