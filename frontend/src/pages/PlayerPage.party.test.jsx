import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import PlayerPage from "./PlayerPage";

// Own file because these assertions are about the copy the user reads, numbers
// included: PlayerPage.test.jsx runs without a dictionary, where t() returns the
// key and every interpolated value disappears.
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

setTranslations({ en, ua });
setDefaultLanguage("en");

beforeEach(() => {
  getPlayerData.mockReset();
  getPlayerReports.mockReset();
  getPlayerExtras.mockReset();
  getPlayerReports.mockResolvedValue({ data: { summary: {}, encounters: [] } });
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

const REGULAR = `account.${"1".repeat(32)}`;
const FILL = `account.${"2".repeat(32)}`;

// One match, two squad-mates, each seen exactly once: the fallback rule -- seen
// in more than one of the fetched matches -- calls both of them fill.
const payload = () => ({
  data: {
    data: {
      platformInfo: { platformSlug: "steam", platformUserId: "account.PlayerA", platformUserHandle: "PlayerA" },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: {
        items: [{
          id: "m1",
          createdAt: "2026-09-08T21:00:00Z",
          mapName: "Erangel",
          gameModeLabel: "Squad FPP",
          matchType: "competitive",
          placement: 2,
          kills: 3,
          damage: 400,
          teammates: [
            { accountId: REGULAR, name: "Regular", kills: 3, damage: 400, placement: 2 },
            { accountId: FILL, name: "Fill", kills: 0, damage: 20, placement: 2 },
          ],
        }],
        summary: { total: 1 },
      },
      profile: { status: "deferred" },
    },
  },
});

const renderPage = async () => {
  const view = render(
    <MemoryRouter initialEntries={["/player/steam/PlayerA"]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText("PlayerA");
  return view;
};

const openSquadTab = () => fireEvent.click(screen.getByRole("tab", { name: "Squad" }));

// antd renders a tooltip's text only while it is open, and into a portal rather
// than into the container, so reading the hint means hovering it first.
const openHint = async (container) => {
  const icon = container.querySelector(".player-match-teammates__hint");
  expect(icon).not.toBeNull();
  fireEvent.mouseEnter(icon);
  const tip = await waitFor(() => {
    const node = document.querySelector(".ant-tooltip-inner");
    expect(node).not.toBeNull();
    return node;
  });
  return tip.textContent;
};
// The matches list is its own pane, and an unvisited pane is not mounted.
const openMatchesTab = () => fireEvent.click(screen.getByRole("tab", { name: "Matches" }));

test("a mate seen once still counts as party when their history says so", async () => {
  getPlayerData.mockResolvedValue(payload());
  getPlayerExtras.mockResolvedValue({
    data: {
      status: "ok",
      party: [
        { accountId: REGULAR, name: "Regular", sharedMatches: 40, theirMatches: 50, sharePct: 80, isParty: true },
        { accountId: FILL, name: "Fill", sharedMatches: 1, theirMatches: 100, sharePct: 1, isParty: false },
      ],
    },
  });

  const { container } = await renderPage();
  openSquadTab();

  const rows = [...container.querySelectorAll(".player-squad-item")];
  const overlapOf = (name) =>
    rows.find((row) => row.textContent.includes(name))?.querySelector(".player-squad-item__overlap")?.textContent;

  // Read off the line itself: the row also prints kills and damage, so "400"
  // would satisfy a search for "40" across the whole row.
  expect(overlapOf("Regular")).toBe("40 of their last 50 matches were with this player (80%)");
  expect(overlapOf("Fill")).toBe("1 of their last 100 matches were with this player (1%)");

  // And the matches list treats only the measured party as party.
  openMatchesTab();
  const partyNames = [...container.querySelectorAll(".player-match-teammates__mate")].map((el) => el.textContent);
  expect(partyNames).toEqual(["Regular"]);
});

test("falls back to the shared-match rule while the overlap is unknown", async () => {
  // Extras can fail or still be in flight. The card must not go blank, and it
  // must not print an overlap it does not have.
  getPlayerData.mockResolvedValue(payload());
  getPlayerExtras.mockResolvedValue({
    data: { status: "partial", error: "party: Rate Limit Reached", party: null },
  });

  const { container } = await renderPage();
  openSquadTab();

  expect(container.querySelectorAll(".player-squad-item")).toHaveLength(2);
  expect(container.querySelector(".player-squad-item__overlap")).toBeNull();

  // Neither mate was seen twice, so the fallback names no party at all -- and
  // the match row is mounted to prove the absence is the rule's answer rather
  // than an unrendered pane.
  openMatchesTab();
  expect(container.querySelector(".player-match-item")).not.toBeNull();
  expect(container.querySelectorAll(".player-match-teammates__mate")).toHaveLength(0);
});

test("the hint names the rule actually in force", async () => {
  // The copy names the 15% floor; drifting the threshold without touching the
  // hint would leave the page explaining a rule it no longer applies. And the
  // fallback rule gets its own text rather than being a clause in this one --
  // a tooltip that describes two rules describes neither.
  expect(en.pages.player.matches.partyHint).toContain("15%");
  expect(ua.pages.player.matches.partyHint).toContain("15%");
  expect(en.pages.player.matches.partyHintFallback).not.toContain("15%");
  expect(ua.pages.player.matches.partyHintFallback).not.toContain("15%");

  getPlayerData.mockResolvedValue(payload());
  getPlayerExtras.mockResolvedValue({
    data: {
      status: "ok",
      party: [{ accountId: REGULAR, name: "Regular", sharedMatches: 40, theirMatches: 50, sharePct: 80, isParty: true }],
    },
  });

  const { container } = await renderPage();
  openMatchesTab();
  // The tooltip only renders its text once opened, so this has to hover it --
  // asserting on the closed page would pass whatever the title said.
  expect(await openHint(container)).toBe(en.pages.player.matches.partyHint);
});

test("with no measurement in, the hint switches to the fallback rule", async () => {
  getPlayerData.mockResolvedValue({
    ...payload(),
    data: {
      data: {
        ...payload().data.data,
        matches: {
          items: [
            { id: "m1", createdAt: "2026-09-08T21:00:00Z", mapName: "Erangel", gameModeLabel: "Squad FPP", matchType: "competitive", placement: 2, kills: 3, damage: 400, teammates: [{ accountId: REGULAR, name: "Regular", kills: 3, damage: 400, placement: 2 }] },
            { id: "m2", createdAt: "2026-09-08T20:00:00Z", mapName: "Erangel", gameModeLabel: "Squad FPP", matchType: "competitive", placement: 5, kills: 1, damage: 120, teammates: [{ accountId: REGULAR, name: "Regular", kills: 1, damage: 90, placement: 5 }] },
          ],
          summary: { total: 2 },
        },
      },
    },
  });
  // party: null means the leg failed, so the fallback rule decides -- and the
  // mate above clears it by appearing in both matches.
  getPlayerExtras.mockResolvedValue({ data: { status: "partial", error: "party: boom", party: null } });

  const { container } = await renderPage();
  openMatchesTab();

  expect([...container.querySelectorAll(".player-match-teammates__mate")].map((el) => el.textContent))
    .toEqual(["Regular", "Regular"]);
  expect(await openHint(container)).toBe(en.pages.player.matches.partyHintFallback);
});
