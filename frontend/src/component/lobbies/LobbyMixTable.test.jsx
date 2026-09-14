import { render, screen } from "@testing-library/react";
import LobbyMixTable from "./LobbyMixTable";

// react-switch-lang's translate() overrides a `t` prop and its own translator
// returns the key when no dictionary is registered, so a component test either
// registers real copy or asserts on keys. This is the cheap end of that: the
// key, then the values, so an assertion can see both.
const t = (key, vars) => [key, ...(vars ? Object.values(vars) : [])].join(" ");

const payload = (rows) => ({
  seasonId: "division.bro.official.pc-2018-43",
  accounts: 5040, matches: 338, shard: "steam",
  firstDate: "2026-09-11", lastDate: "2026-09-13",
  lobbyMix: rows,
});

const goldRow = {
  tier: "gold", lobbies: 300, focals: 2003, opponents: 27042, publishable: true,
  mix: [
    { tier: "silver", count: 13521, share: 0.5, low: 0.42, high: 0.58 },
    { tier: "gold", count: 13521, share: 0.5, low: 0.42, high: 0.58 },
  ],
};

// Slice the header off rather than querying by accessible name: the column
// headers carry the same tier labels as the row headers, so /gold/ matches two
// rows and getByRole throws.
const bodyRows = () => screen.getAllByRole("row").slice(1).map((row) => row.textContent);

test("renders a row for each published tier and nothing for the rest", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow])} />);
  const rows = bodyRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatch(/tier\.gold/);
  expect(rows.join(" ")).not.toMatch(/tier\.master/);
});

test("a cell shows a share, never a raw count", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow])} />);
  expect(screen.queryByText(/13521/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/pages\.rankedLobbies\.table\.cell 50\b/).length).toBe(2);
});

// A tier that really is rare must not round to the same thing as a tier that
// was never there.
test("a fraction of a percent keeps its decimal", () => {
  const rare = {
    ...goldRow,
    mix: [
      { tier: "gold", count: 26_950, share: 0.996, low: 0.9, high: 1 },
      { tier: "master", count: 92, share: 0.004, low: 0, high: 0.02 },
    ],
  };
  render(<LobbyMixTable t={t} data={payload([rare])} />);
  expect(screen.getByText(/pages\.rankedLobbies\.table\.cell 0[.,]4\b/)).toBeInTheDocument();
});

// The other end of the same scale: a tier that is nearly the whole lobby must
// not round up to "100" and claim it is the whole lobby.
test("a share near the top keeps its decimal instead of rounding to 100", () => {
  const rare = {
    ...goldRow,
    mix: [
      { tier: "gold", count: 26_950, share: 0.996, low: 0.9, high: 1 },
      { tier: "master", count: 92, share: 0.004, low: 0, high: 0.02 },
    ],
  };
  render(<LobbyMixTable t={t} data={payload([rare])} />);
  expect(screen.getByText(/pages\.rankedLobbies\.table\.cell 99[.,]6\b/)).toBeInTheDocument();
  expect(screen.queryByText(/pages\.rankedLobbies\.table\.cell 100\b/)).not.toBeInTheDocument();
});

test("with nothing publishable it says so instead of drawing an empty grid", () => {
  render(<LobbyMixTable t={t} data={payload([])} />);
  expect(screen.getByText(/gathering/)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

// The gathering snapshot is by definition the last ARCHIVED season, never the
// one currently being collected, so there is no correct number to print. This
// payload's seasonId carries "43" precisely so a reintroduced
// `{ season: snapshotSeasonNumber(...) }` call would leak it into the fake t()'s
// joined output -- with no interpolation, t() gets called with no second
// argument at all, so nothing but the key renders.
test("the gathering note carries no season number", () => {
  render(<LobbyMixTable t={t} data={payload([])} />);
  const note = screen.getByText(/gathering/);
  expect(note.textContent).toBe("pages.rankedLobbies.gathering");
  expect(note.textContent).not.toMatch(/\d/);
});

test("the sample line names the window and the platform", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow])} />);
  expect(screen.getByText(/2026-09-11/)).toBeInTheDocument();
  expect(screen.getByText(/2026-09-13/)).toBeInTheDocument();
});

// The platform label must come from this page's own dictionary namespace, not
// borrowed from rank-points's -- otherwise a rewording of that page's label
// silently rewords this one too, and this page's own key ships unread.
const masterRow = {
  tier: "master", lobbies: 12, focals: 40, opponents: 0, publishable: false, mix: [],
};

test("a gated tier is named beneath the table with its lobby count", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow, masterRow])} />);
  const note = screen.getByText(/pages\.rankedLobbies\.limits\.gatedLabel\b/);
  expect(note.textContent).toMatch(/tier\.master/);
  expect(note.textContent).toMatch(/\b12\b/);
  expect(note.textContent).toMatch(/pages\.rankedLobbies\.limits\.gatedRule\b/);
});

// Two gated tiers must read as a list, not just one -- the whole point of the
// label-plus-list shape is that it does not need a plural form of anything.
test("two gated tiers are both named in the same note", () => {
  const survivorRow = { tier: "survivor", lobbies: 3, focals: 9, opponents: 0, publishable: false, mix: [] };
  render(<LobbyMixTable t={t} data={payload([goldRow, masterRow, survivorRow])} />);
  const note = screen.getByText(/pages\.rankedLobbies\.limits\.gatedLabel\b/);
  expect(note.textContent).toMatch(/tier\.master/);
  expect(note.textContent).toMatch(/\b12\b/);
  expect(note.textContent).toMatch(/tier\.survivor/);
  expect(note.textContent).toMatch(/\b3\b/);
});

test("with nothing gated the note is not rendered at all", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow])} />);
  expect(screen.queryByText(/pages\.rankedLobbies\.limits\.gatedLabel\b/)).not.toBeInTheDocument();
});

// A column exists only because SOME published row named that tier in its
// mix -- a different published row may never have met it at all.
const masterMixRow = {
  tier: "master", lobbies: 300, focals: 900, opponents: 900, publishable: true,
  mix: [{ tier: "platinum", count: 900, share: 1, low: 0.9, high: 1 }],
};

// A real share is never 0 -- a cell only exists when its count is at least
// 1 -- so a tier absent from a row's mix must not render as if it had been
// measured at a near-zero share.
test("a tier a row never met renders a dash, not a measured 0.0%", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow, masterMixRow])} />);
  const rows = bodyRows();
  const goldRowText = rows.find((r) => /tier\.gold/.test(r));
  // goldRow's own mix never named platinum, so that column must be a dash
  // there, never the joined stub for table.cell with a percent of 0.
  expect(goldRowText).toContain("—");
  expect(goldRowText).not.toMatch(/table\.cell 0\b/);
});

test("the platform label is read from this page's own namespace", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow])} />);
  expect(screen.getByText(/pages\.rankedLobbies\.platform\b/)).toBeInTheDocument();
  expect(screen.queryByText(/pages\.rankPoints\.platform/)).not.toBeInTheDocument();
});
