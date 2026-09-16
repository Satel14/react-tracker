import React from "react";
import { render, screen } from "@testing-library/react";
import BenchmarkTable from "./BenchmarkTable";

// Distinct per tier on purpose: two rows carrying the same number make
// getByText throw on the duplicate, and a fixture that cannot tell the rows
// apart cannot prove the right one was drawn.
const gold = {
  tier: "gold", accounts: 1200, lobbies: 400, publishable: true,
  metrics: {
    damage: { mean: 204.3, low: 183, high: 225 },
    kills: { mean: 1.42, low: 1.3, high: 1.54 },
    minutesAlive: { mean: 15.1, low: 14.6, high: 15.6 },
    placement: { mean: 0.552, low: 0.53, high: 0.57 },
    noKillShare: { share: 0.38, low: 0.35, high: 0.41 },
  },
};
const diamond = {
  tier: "diamond", accounts: 600, lobbies: 320, publishable: true,
  metrics: {
    damage: { mean: 271.8, low: 244, high: 299 },
    kills: { mean: 2.04, low: 1.9, high: 2.2 },
    minutesAlive: { mean: 16.8, low: 16.2, high: 17.4 },
    placement: { mean: 0.681, low: 0.66, high: 0.7 },
    noKillShare: { share: 0.29, low: 0.26, high: 0.32 },
  },
};

const t = (key) => key;

it("draws a row per tier with its measured numbers", () => {
  render(<BenchmarkTable rows={[gold, diamond]} t={t} />);
  expect(screen.getAllByRole("row")).toHaveLength(3); // header + two tiers
  expect(screen.getByText("204")).toBeInTheDocument();
  expect(screen.getByText("272")).toBeInTheDocument();
  expect(screen.getByText("1.4")).toBeInTheDocument();
  expect(screen.getByText("16.8")).toBeInTheDocument();
});

// Direction in words, no arithmetic for the reader: "beats 55% of teams", not
// "average place 0.552".
it("states the placement as teams beaten", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  expect(screen.getByText("55%")).toBeInTheDocument();
});

it("states the no-kill share as a percentage", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  expect(screen.getByText("38%")).toBeInTheDocument();
});

// The interval has to be written in the column's own units. A share formatted
// as a raw number shows "0.5 – 0.6" under a cell reading "55%".
it("writes each interval in the units of its column", () => {
  render(<BenchmarkTable rows={[gold]} t={t} />);
  expect(screen.getByText("55%")).toHaveAttribute("title", "53% – 57%");
  expect(screen.getByText("204")).toHaveAttribute("title", "183 – 225");
  expect(screen.getByText("38%")).toHaveAttribute("title", "35% – 41%");
});

// A metric with too few readings to carry an interval still has a mean.
it("omits the tooltip rather than inventing a range", () => {
  const thin = { ...gold, metrics: { ...gold.metrics, damage: { mean: 204.3, low: null, high: null } } };
  render(<BenchmarkTable rows={[thin]} t={t} />);
  expect(screen.getByText("204")).not.toHaveAttribute("title");
});

it("renders nothing at all when there are no rows", () => {
  const { container } = render(<BenchmarkTable rows={null} t={t} />);
  expect(container).toBeEmptyDOMElement();
});
