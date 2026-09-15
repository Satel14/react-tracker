import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CombatTimeline from "./CombatTimeline";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const timeline = {
  events: [{ t: 12, kind: "dealt", opponent: "Foe", weapon: "M416", amount: 30, region: "TorsoShot" }],
  accuracy: [{ weapon: "M416", shots: 3, hits: 1, pct: 33 }],
  thirdParties: [],
};

const both = {
  ...timeline,
  events: [
    { t: 12, kind: "dealt", opponent: "Foe", weapon: "M416", amount: 30 },
    { t: 40, kind: "taken", opponent: "Cid", weapon: "AKM", amount: 22 },
  ],
};

const logRows = (container) =>
  [...container.querySelectorAll(".timeline__event:not(.timeline__event--head)")].map(
    (row) => row.querySelector(".timeline__event-opp").textContent
  );

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

test("names the columns of the combat log", () => {
  // It shipped as four unlabelled columns directly under the accuracy table,
  // which does have a header -- so the eye read the log as more accuracy rows.
  const { container } = render(<CombatTimeline timeline={timeline} focalPresent t={t} />);
  const head = container.querySelector(".timeline__event--head");
  expect(head).not.toBeNull();
  expect([...head.children].map((c) => c.textContent)).toEqual([
    "pages.match.colTime",
    "pages.match.colOpponent",
    "pages.match.weapon",
    "pages.match.colDamage",
  ]);
});

describe("dealt or taken", () => {
  it("shows both directions until a side is picked", () => {
    const { container } = render(<CombatTimeline timeline={both} focalPresent t={t} />);
    expect(logRows(container)).toEqual(["Foe", "Cid"]);
  });

  it("keeps only what the player dealt", () => {
    const { container } = render(<CombatTimeline timeline={both} focalPresent t={t} />);
    fireEvent.click(screen.getByText("pages.match.filterDealt"));
    expect(logRows(container)).toEqual(["Foe"]);
  });

  it("keeps only what the player took", () => {
    const { container } = render(<CombatTimeline timeline={both} focalPresent t={t} />);
    fireEvent.click(screen.getByText("pages.match.filterTaken"));
    expect(logRows(container)).toEqual(["Cid"]);
  });

  it("says the filter emptied the log rather than showing a bare header", () => {
    // A match where the player dealt damage and took none is ordinary, and
    // four column headings over nothing reads as a failed load.
    render(<CombatTimeline timeline={timeline} focalPresent t={t} />);
    fireEvent.click(screen.getByText("pages.match.filterTaken"));
    expect(screen.getByText("pages.match.noEventsFiltered")).toBeInTheDocument();
  });
});

describe("layout", () => {
  it("puts the accuracy table and the log in one grid", () => {
    // The whole tab measured 532px inside a 1271px viewport, stacked in a
    // single column: side by side it fits on one screen.
    const { container } = render(<CombatTimeline timeline={timeline} focalPresent t={t} />);
    const grid = container.querySelector(".timeline__grid");
    expect([...grid.children].map((c) => c.className.split(" ")[0])).toEqual([
      "timeline__accuracy",
      "timeline__log",
    ]);
  });

  it("keeps the third-party strip above the grid, not inside a column", () => {
    const { container } = render(
      <CombatTimeline timeline={{ ...timeline, thirdParties: [{ t: 70 }] }} focalPresent t={t} />
    );
    const order = [...container.querySelector(".timeline").children].map((c) => c.className.split(" ")[0]);
    expect(order).toEqual(["timeline__third", "timeline__grid"]);
  });
});
