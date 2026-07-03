import React from "react";
import { render, screen } from "@testing-library/react";
import CombatTimeline from "./CombatTimeline";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const timeline = {
  events: [{ t: 12, kind: "dealt", opponent: "Foe", weapon: "M416", amount: 30, region: "TorsoShot" }],
  accuracy: [{ weapon: "M416", shots: 3, hits: 1, pct: 33 }],
  thirdParties: [],
};

test("renders the accuracy table", () => {
  // events[0].weapon and accuracy[0].weapon are both "M416", so scope the
  // query to the accuracy row instead of a bare getByText (same collision
  // fix as DamageBreakdown.test.jsx).
  const { container } = render(<CombatTimeline timeline={timeline} focalPresent t={t} />);
  const accRow = container.querySelector(".timeline__acc-row:not(.timeline__acc-row--head)");
  expect(accRow.textContent).toContain("M416");
  expect(screen.getByText("33%")).toBeInTheDocument();
});

test("renders a combat event row", () => {
  render(<CombatTimeline timeline={timeline} focalPresent t={t} />);
  expect(screen.getByText("Foe")).toBeInTheDocument();
});

test("shows the not-in-match note when focal is absent", () => {
  render(<CombatTimeline timeline={timeline} focalPresent={false} t={t} />);
  expect(screen.getByText("pages.match.focalNotInMatch")).toBeInTheDocument();
});
