import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setTranslations, setDefaultLanguage } from "react-switch-lang";
import en from "../Language/en.json";
import ua from "../Language/ua.json";
import RankedLobbies from "./RankedLobbies";

const published = (tier) => ({
  tier, lobbies: 300, focals: 2003, opponents: 27042, publishable: true,
  mix: [{ tier: "silver", count: 27042, share: 1, low: 0.9, high: 1 }],
});

// Never a real row: opponents: 0 and mix: [] are exactly what lobbyMix.js
// emits for a tier gated out for lack of lobbies, not a fixture shortcut.
const gated = (tier, lobbies) => ({
  tier, lobbies, focals: lobbies, opponents: 0, publishable: false, mix: [],
});

const snapshotOf = (seasonId, lobbyMix) => ({
  seasonId, current: true, shard: "steam", accounts: 5040, matches: 338,
  windows: 3, firstDate: "2026-09-11", lastDate: "2026-09-13", lobbyMix,
});

const committed = snapshotOf("division.bro.official.pc-2018-43", [published("gold")]);

const draw = (load, snapshot = committed, path = "/ranked-lobbies") => {
  setTranslations({ en });
  setDefaultLanguage("en");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RankedLobbies load={load} snapshot={snapshot} />
    </MemoryRouter>,
  );
};

// react-switch-lang's translate() overrides a passed `t` prop and its own
// translator returns the key when no dictionary is registered, so a test that
// never calls setTranslations would pass even against a component wired to no
// dictionary at all -- the tier slugs ("gold", "platinum") are substrings of
// their own untranslated keys ("pages.rankedLobbies.tier.gold"). Registering
// the real dictionary here and resetting after each test, the way
// RankPoints.test.jsx does, is what makes these assertions about real copy.
afterEach(() => {
  setTranslations({});
  setDefaultLanguage("en");
});

const rowNames = () =>
  screen.getAllByRole("row").map((row) => row.textContent);

test("renders the page heading", () => {
  draw(() => new Promise(() => {}));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.pages.rankedLobbies.title);
});

// A component that stopped reading the dictionary would render the raw key
// and no numbers at all, not a sentence with these figures interpolated in.
test("the sample line carries the real numbers, not the translation key", () => {
  draw(() => new Promise(() => {}));
  expect(screen.getByText(/Measured from 5,040 accounts across 338 ranked matches/))
    .toBeInTheDocument();
  expect(screen.queryByText(/pages\.rankedLobbies/)).not.toBeInTheDocument();
});

test("links to the tier benchmarks page", () => {
  draw(() => new Promise(() => {}));
  expect(screen.getByRole("link", { name: en.pages.rankedLobbies.seeStatsByRank }))
    .toHaveAttribute("href", "/stats-by-rank");
});

test("links to the Ukrainian tier benchmarks page from the Ukrainian route", () => {
  draw(() => new Promise(() => {}), committed, "/ua/ranked-lobbies");
  expect(screen.getByRole("link", { name: en.pages.rankedLobbies.seeStatsByRank }))
    .toHaveAttribute("href", "/ua/stats-by-rank");
});

test("a live read with no mix does not replace the committed one", async () => {
  draw(() => Promise.resolve({ data: snapshotOf(committed.seasonId, null) }));
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/gold/i));
});

// The committed reading is the stale one once the season turns, even though it
// is the fuller one, so this guard has to fire in the opposite direction.
test("a live read naming a different season does replace it", async () => {
  draw(() =>
    Promise.resolve({ data: snapshotOf("division.bro.official.pc-2018-44", [published("platinum")]) }),
  );
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/platinum/i));
  expect(rowNames().join(" ")).not.toMatch(/\bgold\b/i);
});

test("a failed live read leaves the committed table on the page", async () => {
  draw(() => Promise.reject(new Error("offline")));
  await waitFor(() => expect(rowNames().join(" ")).toMatch(/gold/i));
});

test("with no committed reading at all the page still renders its prose", () => {
  draw(() => new Promise(() => {}), null);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

// The tier a gate exists for is precisely the one likeliest to be gated on
// exactly one lobby, so "1 lobbies" would be the common case rather than an
// edge case.
test("a gated tier with exactly one lobby reads as singular in English", () => {
  draw(
    () => new Promise(() => {}),
    snapshotOf("division.bro.official.pc-2018-43", [published("gold"), gated("survivor", 1)]),
  );
  expect(screen.getByText(/\(1 lobby\)/)).toBeInTheDocument();
  expect(screen.queryByText(/\(1 lobbies\)/)).not.toBeInTheDocument();
});

test("a gated tier with more than one lobby reads as plural in English", () => {
  draw(
    () => new Promise(() => {}),
    snapshotOf("division.bro.official.pc-2018-43", [published("gold"), gated("survivor", 12)]),
  );
  expect(screen.getByText(/\(12 lobbies\)/)).toBeInTheDocument();
});

// "лобі" is an indeclinable loanword in Ukrainian: it reads the same at every
// count, so this is a check that it was left alone rather than "fixed" to
// match the English plural rule it does not have.
test("a gated tier with exactly one lobby reads the same invariant word in Ukrainian", () => {
  setTranslations({ ua });
  setDefaultLanguage("ua");
  render(
    <MemoryRouter initialEntries={["/ranked-lobbies"]}>
      <RankedLobbies
        load={() => new Promise(() => {})}
        snapshot={snapshotOf("division.bro.official.pc-2018-43", [published("gold"), gated("survivor", 1)])}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText(/\(1 лобі\)/)).toBeInTheDocument();
});
