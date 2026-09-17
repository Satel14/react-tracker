import React from "react";
import { render, screen } from "@testing-library/react";
import BenchmarkTable from "./BenchmarkTable";

// Distinct per tier on purpose: two rows carrying the same number make
// getByText throw on the duplicate, and a fixture that cannot tell the rows
// apart cannot prove the right one was drawn.
//
// The quartiles sit far wider than the interval, as they do in the real data:
// low/high are the uncertainty of the mean and shrink with the sample, p25/p75
// are the spread of players and do not. A fixture where the two looked alike
// would hide a cell that printed the wrong pair.
const gold = {
  tier: "gold", accounts: 1200, lobbies: 400, publishable: true,
  metrics: {
    damage: { mean: 204.3, low: 183, high: 225, p25: 94.2, p50: 168.4, p75: 271.1 },
    kills: { mean: 1.42, low: 1.3, high: 1.54, p25: 0.0, p50: 1.0, p75: 2.0 },
    minutesAlive: { mean: 15.1, low: 14.6, high: 15.6, p25: 8.2, p50: 14.3, p75: 21.7 },
    placement: { mean: 0.552, low: 0.53, high: 0.57, p25: 0.27, p50: 0.58, p75: 0.86 },
    noKillShare: { share: 0.38, low: 0.35, high: 0.41 },
  },
};
const diamond = {
  tier: "diamond", accounts: 600, lobbies: 320, publishable: true,
  metrics: {
    damage: { mean: 271.8, low: 244, high: 299, p25: 131.5, p50: 239.2, p75: 366.4 },
    kills: { mean: 2.04, low: 1.9, high: 2.2, p25: 1.0, p50: 2.0, p75: 3.0 },
    minutesAlive: { mean: 16.8, low: 16.2, high: 17.4, p25: 9.9, p50: 16.4, p75: 23.3 },
    placement: { mean: 0.681, low: 0.66, high: 0.7, p25: 0.41, p50: 0.72, p75: 0.93 },
    noKillShare: { share: 0.29, low: 0.26, high: 0.32 },
  },
};

const t = (key, params) =>
  params ? `${key}:${Object.values(params).join("|")}` : key;

// The median, not the average. An average of per-match damage is dragged up by
// the few enormous games, and the question the page is read with -- "is this
// normal for Gold" -- is a question about the typical player.
it("draws a row per tier with the tier's median", () => {
  render(<BenchmarkTable rows={[gold, diamond]} t={t} />);
  expect(screen.getAllByRole("row")).toHaveLength(3); // header + two tiers
  expect(screen.getByText("168")).toBeInTheDocument();
  expect(screen.getByText("239")).toBeInTheDocument();
  expect(screen.getByText("16.4")).toBeInTheDocument();
  // And the average it replaced is not printed as though it were the median.
  expect(screen.queryByText("204")).not.toBeInTheDocument();
  expect(screen.queryByText("272")).not.toBeInTheDocument();
});

// The other half of every cell, and the reason this package exists: the
// interval never said how far apart two players of one tier are.
it("prints the middle 50% under the median, in the column's own units", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  expect(screen.getByText("94 – 271")).toBeInTheDocument();
  expect(screen.getByText("8.2 – 21.7")).toBeInTheDocument();
  expect(screen.getByText("27% – 86%")).toBeInTheDocument();
});

// Direction in words, no arithmetic for the reader: "beats 58% of teams", not
// "median place 0.58".
it("states the placement as teams beaten", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  expect(screen.getByText("58%")).toBeInTheDocument();
});

// Each sampled account contributes one match, so its no-kill value is 0 or 1
// and quartiles would read the same on every tier. It keeps the single share.
it("states the no-kill share as a percentage, with no range under it", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  const cell = screen.getByText("38%");
  expect(cell.tagName).toBe("TD");
  expect(cell.querySelector(".stats-by-rank__spread")).toBeNull();
});

// Nothing essential in the title -- a phone cannot hover -- but the average
// still has to be reachable, and written in the column's own units.
it("keeps the average and its interval in the cell title", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  expect(screen.getByText("168").closest("td"))
    .toHaveAttribute("title", "pages.statsByRank.table.cellTitle:204|183|225");
  expect(screen.getByText("38%")).toHaveAttribute("title", "35% – 41%");
});

// A metric with too few readings to carry an interval still has a median.
it("omits the title rather than inventing a range", () => {
  const thin = {
    ...gold,
    metrics: { ...gold.metrics, damage: { ...gold.metrics.damage, low: null, high: null } },
  };
  render(<BenchmarkTable rows={[thin]} t={t} />);
  expect(screen.getByText("168").closest("td")).not.toHaveAttribute("title");
  expect(screen.getByText("94 – 271")).toBeInTheDocument();
});

it("renders nothing at all when there are no rows", () => {
  const { container } = render(<BenchmarkTable rows={null} t={t} />);
  expect(container).toBeEmptyDOMElement();
});
