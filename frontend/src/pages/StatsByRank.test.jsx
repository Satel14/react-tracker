import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import StatsByRank from "./StatsByRank";

// Distinct numbers per tier, for the reason BenchmarkTable.test.jsx gives: two
// rows carrying the same figure make getByText throw on the duplicate, and a
// fixture that cannot tell its rows apart cannot prove the right one was drawn.
const published = (tier, damage) => ({
  tier,
  accounts: 1200,
  lobbies: 400,
  publishable: true,
  metrics: {
    damage: { mean: damage, low: damage - 21, high: damage + 21 },
    kills: { mean: 1.42, low: 1.3, high: 1.54 },
    minutesAlive: { mean: 15.1, low: 14.6, high: 15.6 },
    placement: { mean: 0.552, low: 0.53, high: 0.57 },
    noKillShare: { share: 0.38, low: 0.35, high: 0.41 },
  },
});

// Never a fixture shortcut: benchmarks.js emits a full metrics block for a tier
// it gates out too -- the gate is one decision for the whole row, taken on the
// raw counts, not a missing measurement.
const gated = (tier, accounts) => ({
  tier,
  accounts,
  lobbies: 12,
  publishable: false,
  metrics: {
    damage: { mean: 288.4, low: null, high: null },
    kills: { mean: 2.2, low: null, high: null },
    minutesAlive: { mean: 17.2, low: null, high: null },
    placement: { mean: 0.7, low: null, high: null },
    noKillShare: { share: 0.25, low: null, high: null },
  },
});

const snapshotOf = (seasonId, benchmarks) => ({
  seasonId,
  current: true,
  shard: "steam",
  accounts: 9243,
  matches: 622,
  windows: 4,
  firstDate: "2026-09-11",
  lastDate: "2026-09-14",
  benchmarks,
});

const SEASON = "division.bro.official.pc-2018-43";
const committed = snapshotOf(SEASON, [published("gold", 204.3)]);
const gathering = snapshotOf(SEASON, null);

const draw = (load, snapshot = committed, path = "/stats-by-rank") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <StatsByRank load={load} snapshot={snapshot} />
    </MemoryRouter>,
  );

// react-switch-lang's translate() overrides a passed `t` prop, and its own
// translator returns the key verbatim when no dictionary is registered -- so a
// spec that never called setTranslations would assert against key strings that
// happen to contain the words it is looking for. Registering the real
// dictionary and resetting after each test is what makes these assertions
// about real copy, the way RankedLobbies.test.jsx does.
const english = (snapshot, load = () => new Promise(() => {})) => {
  setTranslations({ en });
  setDefaultLanguage("en");
  return draw(load, snapshot);
};

afterEach(() => {
  setTranslations({});
  setDefaultLanguage("en");
});

const rowNames = () => screen.getAllByRole("row").map((row) => row.textContent);

test("renders the table from the committed snapshot without waiting for a fetch", () => {
  english(committed);
  expect(screen.getByText("204")).toBeInTheDocument();
});

// A control that cannot answer is not rendered disabled, it is not rendered.
test("hides the lookup while the page is still gathering", () => {
  english(gathering);
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.getByText(en.pages.statsByRank.gathering)).toBeInTheDocument();
});

test("offers the lookup as soon as there is a table to look up against", () => {
  english(committed);
  expect(screen.getByRole("spinbutton")).toBeInTheDocument();
});

// The gathering state's snapshot is by definition the ARCHIVED season, so
// naming a season there is false twice over. This shipped once already.
test("names no season while gathering", () => {
  english(gathering);
  expect(screen.queryByText(/season \d+/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/сезон \d+/i)).not.toBeInTheDocument();
});

test("names the gated tiers and their account counts below the table", () => {
  english(snapshotOf(SEASON, [published("gold", 204.3), gated("master", 70)]));
  expect(screen.getByTestId("gated-tiers")).toHaveTextContent("70");
  expect(screen.getByTestId("gated-tiers")).toHaveTextContent("Master");
});

test("renders no gated line at all when nothing was gated", () => {
  english(committed);
  expect(screen.queryByTestId("gated-tiers")).not.toBeInTheDocument();
});

// Those figures trace to our own RANK_PROGRESS_STEPS, not to KRAFTON.
test("publishes no rank-point band for any tier", () => {
  const { container } = english(committed);
  expect(container.textContent).not.toMatch(/\bRP\b/);
});

test("says when and from what the numbers were measured", () => {
  english(committed);
  expect(screen.getByText(/9,243 accounts across 622 ranked matches/)).toBeInTheDocument();
  expect(screen.getByText(/2026-09-11/)).toBeInTheDocument();
});

// A component that stopped reading the dictionary would render the raw key,
// and every assertion above about a sentence would still pass on a substring.
test("reads its copy from the dictionary rather than printing its keys", () => {
  const { container } = english(committed);
  expect(container.textContent).not.toMatch(/pages\.statsByRank/);
});

test("a live read with no benchmarks does not replace the committed one", async () => {
  english(committed, () => Promise.resolve({ data: gathering }));
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/gold/i));
});

// The committed reading is the stale one once the season turns, even though it
// is the fuller one, so this guard has to fire in the opposite direction.
test("a live read naming a different season does replace it", async () => {
  english(committed, () =>
    Promise.resolve({
      data: snapshotOf("division.bro.official.pc-2018-44", [published("platinum", 233.7)]),
    }),
  );
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/platinum/i));
  expect(rowNames().join(" ")).not.toMatch(/\bgold\b/i);
});

test("a failed live read leaves the committed table on the page", async () => {
  english(committed, () => Promise.reject(new Error("offline")));
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/gold/i));
});

test("with no committed reading at all the page still renders its prose", () => {
  english(null);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("renders the Ukrainian twin from the ua dictionary", () => {
  setTranslations({ ua });
  setDefaultLanguage("ua");
  draw(() => new Promise(() => {}), committed, "/ua/stats-by-rank");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(ua.pages.statsByRank.h1);
  expect(screen.queryByText(en.pages.statsByRank.h1)).not.toBeInTheDocument();
});

// The outro links back to /ranks and /ranked-lobbies shipped English-only
// (commit 804244a): a reader on the Ukrainian twin who followed either one
// landed back on the English article. /rank-points was missing outright --
// this page had no inbound link to it at all.
test("points the outro links at the language-matched twins", () => {
  english(committed);
  expect(screen.getByRole("link", { name: en.pages.statsByRank.seeRanks }))
    .toHaveAttribute("href", "/ranks");
  expect(screen.getByRole("link", { name: en.pages.statsByRank.seeRankedLobbies }))
    .toHaveAttribute("href", "/ranked-lobbies");
  expect(screen.getByRole("link", { name: en.pages.statsByRank.seeRankPoints }))
    .toHaveAttribute("href", "/rank-points");

  setTranslations({ ua });
  setDefaultLanguage("ua");
  draw(() => new Promise(() => {}), committed, "/ua/stats-by-rank");
  expect(screen.getByRole("link", { name: ua.pages.statsByRank.seeRanks }))
    .toHaveAttribute("href", "/ua/ranks");
  expect(screen.getByRole("link", { name: ua.pages.statsByRank.seeRankedLobbies }))
    .toHaveAttribute("href", "/ua/ranked-lobbies");
  expect(screen.getByRole("link", { name: ua.pages.statsByRank.seeRankPoints }))
    .toHaveAttribute("href", "/ua/rank-points");
});

// The only path between the two versions a reader who landed on the wrong one
// has, and the only one a crawler that runs no JavaScript has.
test("links each language at the other", () => {
  english(committed);
  expect(screen.getByRole("link", { name: "Читати українською" })).toHaveAttribute(
    "href",
    "/ua/stats-by-rank",
  );

  setTranslations({ ua });
  setDefaultLanguage("ua");
  draw(() => new Promise(() => {}), committed, "/ua/stats-by-rank");
  expect(screen.getByRole("link", { name: "Read in English" })).toHaveAttribute(
    "href",
    "/stats-by-rank",
  );
});
