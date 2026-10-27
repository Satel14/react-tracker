import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import PlayerPage from "./PlayerPage";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const getPlayerData = vi.fn();
const locatePlayer = vi.fn();

vi.mock("../api/player", () => ({
  getPlayerData: (...args) => getPlayerData(...args),
  getPlayerReports: () => Promise.resolve({ data: { summary: {}, encounters: [] } }),
  getPlayerExtras: () => Promise.resolve({ data: null }),
  prefetchMatchReplay: () => Promise.resolve({ data: {} }),
  locatePlayer: (...args) => locatePlayer(...args),
}));

vi.mock("../cookie/store", () => ({
  FAVORITES_UPDATED_EVENT: "favorites:updated",
  addHistory: () => {},
  isFavorite: () => Promise.resolve(false),
  toggleFavorite: () => Promise.resolve({ favorited: false }),
}));

vi.mock("./MapsTab", () => ({ default: () => <div data-testid="maps-tab" /> }));
vi.mock("../component/Notification", () => ({ default: () => {} }));

afterEach(() => {
  setTranslations({});
  setDefaultLanguage("en");
});

beforeEach(() => {
  setTranslations({ en, ua });
  setDefaultLanguage("en");
  setLanguage("en");
  getPlayerData.mockReset();
  locatePlayer.mockReset();
  locatePlayer.mockResolvedValue({ status: 200, data: { found: [{ platform: "xbox", name: "Someone" }], complete: true } });
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

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );

const notFound = () => getPlayerData.mockResolvedValue({ status: 200, message: "Player not found" });

test("a nickname that is not found is looked for on the other platforms", async () => {
  notFound();
  renderAt("/player/steam/Someone");

  expect(await screen.findByRole("link", { name: "Someone" })).toHaveAttribute("href", "/player/xbox/Someone");
  expect(locatePlayer).toHaveBeenCalledWith("steam", "Someone");
});

test("an account id that is not found is not looked for elsewhere", async () => {
  notFound();
  renderAt("/player/steam/account.0123456789abcdef0123456789abcdef");

  await screen.findByText("Player not found");
  expect(locatePlayer).not.toHaveBeenCalled();
});

test("a rate-limited lookup is not looked for elsewhere", async () => {
  getPlayerData.mockResolvedValue({ status: 200, message: "Rate Limit Reached" });
  renderAt("/player/steam/Someone");

  await screen.findByRole("button", { name: /Try again/ });
  expect(locatePlayer).not.toHaveBeenCalled();
});
