import React from "react";
import { render, screen, within } from "@testing-library/react";
import { setTranslations, setDefaultLanguage, setLanguage, t } from "react-switch-lang";
import en from "../../Language/en.json";
import RankPointsTable from "./RankPointsTable";

// react-switch-lang's own translator returns the key when no dictionary is
// registered, and its translate() HOC overrides a `t` passed as a prop -- so a
// test that needs real copy has to register the dictionary rather than stub t.
// The installed version (1.0.2) exports no getTranslate(); `t` itself is the
// live-bound translator once a dictionary is registered, matching the pattern
// already used in TierDistribution.test.jsx and RankPercentile.test.jsx.
setTranslations({ en });
setDefaultLanguage("en");
setLanguage("en");

const payload = (overrides = {}) => ({
  seasonId: "division.bro.official.pc-2018-43",
  current: true,
  shard: "steam",
  accounts: 11836,
  matches: 800,
  firstDate: "2026-09-11",
  lastDate: "2026-09-17",
  rpPercentiles: Array.from({ length: 101 }, (_, i) => 5000 - i * 40),
  ...overrides,
});

describe("RankPointsTable", () => {
  it("renders nine rows counted upwards", () => {
    render(<RankPointsTable t={t} data={payload()} />);
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(9);
    expect(rows[0]).toHaveTextContent("above 99% of players");
    expect(rows[8]).toHaveTextContent("above 1% of players");
  });

  // The row labels were pinned, but never the cell they sit next to -- the
  // table's entire published payload. Renaming cut.rp to cut.value in the
  // component would leave nine blank cells and every existing test green.
  it("puts the measured RP value in the matching row's cell", () => {
    render(<RankPointsTable t={t} data={payload()} />);
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    const row = rows.find((r) => /above 50% of players/.test(r.textContent));
    expect(row).toBeTruthy();
    expect(within(row).getByRole("cell")).toHaveTextContent("3,000");
  });

  it("never phrases a row as a top-n percentage", () => {
    render(<RankPointsTable t={t} data={payload()} />);
    expect(screen.queryByText(/top \d+%/i)).toBeNull();
  });

  it("leads with the median", () => {
    render(<RankPointsTable t={t} data={payload()} />);
    // index 50 of the table above
    expect(screen.getByText(/Half the ranked players/)).toHaveTextContent("3,000");
  });

  it("prints the sample it was measured from", () => {
    render(<RankPointsTable t={t} data={payload()} />);
    expect(screen.getByText(/Measured from/)).toHaveTextContent("11,836");
  });

  it("says so when the season it measured has ended", () => {
    render(<RankPointsTable t={t} data={payload({ current: false })} />);
    expect(screen.getByText(/Season 43 has ended/)).toBeInTheDocument();
  });

  // The launch state, not a fallback branch: season 42's table is unreachable
  // and season 43's does not exist until the census has three windows.
  it("names the wait instead of a table when there is no table", () => {
    render(<RankPointsTable t={t} data={payload({ rpPercentiles: null })} />);
    expect(screen.getByText(/Collection for Season 43 has only just started/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("treats a malformed table as no table", () => {
    render(<RankPointsTable t={t} data={payload({ rpPercentiles: [1, 2, 3] })} />);
    expect(screen.queryByRole("table")).toBeNull();
  });
});
