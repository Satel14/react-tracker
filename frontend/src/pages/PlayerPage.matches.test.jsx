import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

const matchItem = (overrides = {}) => ({
  id: "m-1",
  createdAt: "2026-08-27T19:46:15Z",
  mapName: "Erangel",
  gameMode: "squad-fpp",
  gameModeLabel: "Squad FPP",
  matchType: "competitive",
  placement: 3,
  isWin: false,
  kills: 5,
  damage: 612,
  assists: 2,
  dbnos: 3,
  survivalTimeLabel: "28:10",
  longestKill: 143,
  teammates: [],
  ...overrides,
});

const payload = (items, summary = {}) => ({
  data: {
    data: {
      platformInfo: { platformSlug: "steam", platformUserId: "account.PlayerA", platformUserHandle: "PlayerA" },
      segments: [{ stats: { kd: { displayValue: "1.00" } } }],
      seasons: [],
      matches: { items, summary: { total: items.length, ...summary } },
      profile: {},
    },
  },
});

const renderMatchesCard = async (items, summary) => {
  getPlayerData.mockResolvedValue(payload(items, summary));
  render(
    <MemoryRouter initialEntries={["/player/steam/PlayerA"]}>
      <Routes>
        <Route path="/player/:platform/:gameId" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText("PlayerA");
  fireEvent.click(screen.getByRole("tab", { name: "Matches" }));
  return screen.getByText("Recent Matches").closest("section");
};

const rowsOf = (card) => card.querySelectorAll(".player-match-item");

const partyOf = (row) => row.querySelector(".player-match-teammates");

const mate = (overrides = {}) => ({
  accountId: "account.mateA",
  name: "MateA",
  kills: 3,
  damage: 480,
  placement: 3,
  ...overrides,
});

const hoverHint = async (row) => {
  fireEvent.mouseEnter(within(row).getByLabelText(en.pages.player.matches.rpHint));
  return screen.findByRole("tooltip");
};

test("marks only competitive rows as Ranked and gives only them an RP cell", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "ranked" }),
    matchItem({ id: "normal", matchType: "official" }),
  ]);
  const rows = rowsOf(card);

  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText(en.pages.player.matches.ranked)).toBeInTheDocument();
  expect(within(rows[1]).queryByText(en.pages.player.matches.ranked)).not.toBeInTheDocument();
  expect(card.querySelectorAll(".player-rp-delta")).toHaveLength(1);
  expect(rows[0].querySelector(".player-match-stats")).toHaveClass("player-match-stats--ranked");
  expect(rows[1].querySelector(".player-match-stats")).not.toHaveClass("player-match-stats--ranked");
});

test("shows a dash with the default explanation when no RP delta is known", async () => {
  const card = await renderMatchesCard([matchItem()]);
  const row = rowsOf(card)[0];

  expect(within(row).getByText("—")).toBeInTheDocument();
  const hint = within(row).getByLabelText(en.pages.player.matches.rpHint);
  expect(hint).toHaveAttribute("tabindex", "0");
  const tooltip = await hoverHint(row);
  expect(tooltip).toHaveTextContent(en.pages.player.matches.rpTooltipDefault);
});

test("opens the RP hint tooltip on keyboard focus, not just hover", async () => {
  const card = await renderMatchesCard([matchItem()]);
  const row = rowsOf(card)[0];
  const hint = within(row).getByLabelText(en.pages.player.matches.rpHint);

  fireEvent.focus(hint);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent(en.pages.player.matches.rpTooltipDefault);
});

test("renders an exact gain in the up colour and a loss in the down colour", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "gain", rpDelta: { kind: "exact", value: 23 } }),
    matchItem({ id: "loss", rpDelta: { kind: "exact", value: -15 } }),
  ]);
  const rows = rowsOf(card);

  const gain = within(rows[0]).getByText("+23 RP");
  expect(gain.closest(".player-rp-delta")).toHaveClass("player-rp-delta--up");
  const loss = within(rows[1]).getByText("-15 RP");
  expect(loss.closest(".player-rp-delta")).toHaveClass("player-rp-delta--down");
  expect(card.querySelector(".player-rp-summary")).toBeNull();
});

test("starts loading replay data when the user shows intent to open it", async () => {
  const card = await renderMatchesCard([matchItem()]);
  const replay = within(card).getByRole("link", { name: en.pages.replay.open });

  fireEvent.focus(replay);

  expect(prefetchMatchReplay).toHaveBeenCalledWith("m-1", "steam", "account.PlayerA", "PlayerA");
});

test("keeps grouped RP at a dash instead of presenting it as a per-match value", async () => {
  const since = Date.parse("2026-08-26T18:00:00Z");
  const group = { kind: "group", value: 37, matches: 3 };
  const card = await renderMatchesCard(
    [matchItem({ id: "a", rpDelta: group }), matchItem({ id: "b", rpDelta: group }), matchItem({ id: "c", rpDelta: group })],
    { rankPoints: { ...group, since } }
  );

  expect(card.querySelector(".player-rp-summary")).toBeNull();
  expect(within(card).getAllByText("—")).toHaveLength(3);

  const tooltip = await hoverHint(rowsOf(card)[0]);
  expect(tooltip).toHaveTextContent("Part of +37 RP across 3 ranked matches.");
});

test("does not present an unattributed RP adjustment as a per-match value", async () => {
  const card = await renderMatchesCard([matchItem({ id: "n", matchType: "official" })], {
    rankPoints: { kind: "adjustment", value: -100, matches: 0, since: Date.parse("2026-08-20T18:00:00Z") },
  });
  expect(card.querySelector(".player-rp-summary")).toBeNull();
});

// PUBG records the in-game squad, fill included, and nothing about who queued
// together. The party is therefore inferred: a squad-mate who was with the
// player in more than one of the listed matches queued with them; a one-off is
// fill. Verified against live data on 2026-09-01 -- the match record's roster,
// its telemetry and the official docs all carry no party marker.
const mateB = () => mate({ accountId: "account.mateB", name: "MateB", kills: 1, damage: 210 });

test("names the party of a match: the squad-mates who recur across the listed matches", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate(), mateB()] }),
    matchItem({ id: "m-2", teammates: [mate(), mateB()] }),
  ]);
  const party = partyOf(rowsOf(card)[0]);

  expect(within(party).getByText(en.pages.player.matches.party)).toBeInTheDocument();
  expect(within(party).getByRole("link", { name: "MateA" })).toHaveAttribute("href", "/player/steam/MateA");
  expect(within(party).getByRole("link", { name: "MateB" })).toHaveAttribute("href", "/player/steam/MateB");
});

test("leaves a one-off squad-mate out of the party, because a fill is not a party", async () => {
  const fill = mate({ accountId: "account.fill", name: "Bozzidar", kills: 4, damage: 390 });
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate(), mateB(), fill] }),
    matchItem({ id: "m-2", teammates: [mate(), mateB()] }),
  ]);
  const rows = rowsOf(card);

  const party = partyOf(rows[0]);
  expect(within(party).getByRole("link", { name: "MateA" })).toBeInTheDocument();
  expect(within(party).getByRole("link", { name: "MateB" })).toBeInTheDocument();
  expect(within(card).queryByText("Bozzidar")).toBeNull();
});

const partyNames = (party) =>
  party ? [...party.querySelectorAll(".player-match-teammates__mate")].map((el) => el.textContent) : null;

test("decides the party over the whole list but shows each row only the party mates who were in that match", async () => {
  // MateA: 3 of 4; MateB: two non-adjacent matches; MateC: once. A row whose
  // whole roster is fill gets no strip even though a party exists elsewhere.
  const c = mate({ accountId: "account.mateC", name: "MateC" });
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate(), mateB()] }),
    matchItem({ id: "m-2", teammates: [c] }),
    matchItem({ id: "m-3", teammates: [mate(), mateB()] }),
    matchItem({ id: "m-4", teammates: [mate()] }),
  ]);
  const rows = rowsOf(card);

  expect(rows.length).toBe(4);
  expect(partyNames(partyOf(rows[0]))).toEqual(["MateA", "MateB"]);
  expect(partyOf(rows[1])).toBeNull();
  expect(partyNames(partyOf(rows[2]))).toEqual(["MateA", "MateB"]);
  expect(partyNames(partyOf(rows[3]))).toEqual(["MateA"]);
  expect(within(card).queryByText("MateC")).toBeNull();
});

test("shows no party strip when every squad-mate is a one-off", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate(), mateB()] }),
    matchItem({ id: "m-2", teammates: [mate({ accountId: "account.x", name: "X" })] }),
  ]);

  expect(partyOf(rowsOf(card)[0])).toBeNull();
  expect(partyOf(rowsOf(card)[1])).toBeNull();
});

test("never counts a bot as party, even when the same bot id recurs", async () => {
  const bot = mate({ accountId: "ai.1234", name: "BotBuddy", kills: 0, damage: 0 });
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate(), bot] }),
    matchItem({ id: "m-2", teammates: [mate(), bot] }),
  ]);
  const party = partyOf(rowsOf(card)[0]);

  expect(within(party).getByRole("link", { name: "MateA" })).toBeInTheDocument();
  expect(within(party).queryByText("BotBuddy")).toBeNull();
});

test("leaves a party mate PUBG never named as plain text because it has no profile to open", async () => {
  const ghost = mate({ accountId: "account.ghost", name: "Unknown" });
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [ghost] }),
    matchItem({ id: "m-2", teammates: [ghost] }),
  ]);
  const party = partyOf(rowsOf(card)[0]);

  expect(within(party).getByText("Unknown")).toBeInTheDocument();
  expect(within(party).queryByRole("link")).toBeNull();
  // Marked as well as unlinked: .profile-link inherits its colour and drops its
  // underline by design, so without a hook of its own an unlinked name reads
  // exactly like one that does open a profile.
  expect(within(party).getByText("Unknown").closest(".player-match-teammates__mate"))
    .toHaveClass("player-match-teammates__mate--plain");
});

test("carries each party mate's kills and damage on hover", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate()] }),
    matchItem({ id: "m-2", teammates: [mate({ kills: 9, damage: 1020 })] }),
  ]);

  const rows = rowsOf(card);
  expect(within(partyOf(rows[0])).getByRole("link", { name: "MateA" })).toHaveAttribute(
    "title",
    "MateA: 3 kills, 480 damage"
  );
  expect(within(partyOf(rows[1])).getByRole("link", { name: "MateA" })).toHaveAttribute(
    "title",
    "MateA: 9 kills, 1020 damage"
  );
});

test("explains on hover and on keyboard focus how the party is told apart from fill", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "m-1", teammates: [mate()] }),
    matchItem({ id: "m-2", teammates: [mate()] }),
  ]);
  const texts = en.pages.player.matches;
  // Pinned as strings first: a missing key would make t() echo the key path and
  // the matchers below would happily accept it.
  expect(texts.partyHintLabel).toEqual(expect.any(String));
  expect(texts.partyHint).toEqual(expect.any(String));

  const hint = within(partyOf(rowsOf(card)[0])).getByLabelText(texts.partyHintLabel);
  expect(hint).toHaveAttribute("tabindex", "0");
  fireEvent.focus(hint);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent(texts.partyHint);
});

test("shows no party strip at all for a solo match", async () => {
  const card = await renderMatchesCard([matchItem({ teammates: [] })]);

  expect(partyOf(rowsOf(card)[0])).toBeNull();
});

test("offers a lobby link onto the scoreboard tab beside an unchanged replay link", async () => {
  const card = await renderMatchesCard([matchItem()]);
  const row = rowsOf(card)[0];

  expect(within(row).getByRole("link", { name: en.pages.player.matches.lobby })).toHaveAttribute(
    "href",
    "/match/steam/m-1/replay?accountId=account.PlayerA&playerName=PlayerA&tab=scoreboard"
  );
  expect(within(row).getByRole("link", { name: en.pages.replay.open })).toHaveAttribute(
    "href",
    "/match/steam/m-1/replay?accountId=account.PlayerA&playerName=PlayerA"
  );
});

test("explains noBaseline, pending and unattributed rows on hover", async () => {
  const card = await renderMatchesCard([
    matchItem({ id: "nb", rpDelta: { kind: "noBaseline" } }),
    matchItem({ id: "pd", rpDelta: { kind: "pending" } }),
    matchItem({ id: "un", rpDelta: { kind: "unattributed" } }),
  ]);
  const rows = rowsOf(card);
  const texts = en.pages.player.matches;

  const hoverLast = async (row) => {
    fireEvent.mouseEnter(within(row).getByLabelText(texts.rpHint));
    const tooltips = await screen.findAllByRole("tooltip");
    return tooltips[tooltips.length - 1];
  };

  expect(await hoverLast(rows[0])).toHaveTextContent(texts.rpTooltipNoBaseline);
  fireEvent.mouseLeave(within(rows[0]).getByLabelText(texts.rpHint));
  expect(await hoverLast(rows[1])).toHaveTextContent(texts.rpTooltipPending);
  fireEvent.mouseLeave(within(rows[1]).getByLabelText(texts.rpHint));
  expect(await hoverLast(rows[2])).toHaveTextContent(texts.rpTooltipUnattributed);
});
