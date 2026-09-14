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

test("the sample line names the window and the platform", () => {
  render(<LobbyMixTable t={t} data={payload([goldRow])} />);
  expect(screen.getByText(/2026-09-11/)).toBeInTheDocument();
  expect(screen.getByText(/2026-09-13/)).toBeInTheDocument();
});
