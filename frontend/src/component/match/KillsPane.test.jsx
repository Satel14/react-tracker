import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import KillsPane from "./KillsPane";

// The map paints to a canvas, which jsdom cannot report on, so it stands in as
// a div that prints the ids it was handed. That is exactly what these tests
// need to check: that the map and the feed are looking at the same kills.
vi.mock("./KillMap", async () => {
  const React = await import("react");
  return {
    default: (props) =>
      React.createElement("div", {
        "data-testid": "map",
        "data-ids": props.kills.map((k) => k.id).join(","),
        "data-highlight": String(props.highlightId),
      }),
  };
});

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const kills = [
  { t: 10, killerName: "Me", killerAccountId: "account.me", victimName: "Foe", weapon: "M416", kx: 1, ky: 1, vx: 2, vy: 2, isFocalKill: true, isFocalDeath: false },
  { t: 50, killerName: "Ann", victimName: "Bob", weapon: "AKM", kx: 1, ky: 1, vx: 2, vy: 2, isFocalKill: false, isFocalDeath: false },
  { t: 90, killerName: "Cid", victimName: "Me", weapon: "Kar98k", kx: 1, ky: 1, vx: 2, vy: 2, isFocalKill: false, isFocalDeath: true },
];

const show = (props = {}) =>
  render(
    <MemoryRouter>
      <KillsPane kills={kills} rawMapName="Baltic_Main" duration={100} platform="steam" t={t} {...props} />
    </MemoryRouter>
  );

const mapIds = () => screen.getByTestId("map").getAttribute("data-ids");
const feedNames = (container) =>
  [...container.querySelectorAll(".kill-feed__row")].map((row) => row.querySelector(".kill-feed__victim").textContent);

it("shows the map and the feed side by side", () => {
  const { container } = show();
  expect(screen.getByTestId("map")).toBeInTheDocument();
  expect(feedNames(container)).toEqual(["Foe", "Bob", "Me"]);
});

describe("one set of filters for both views", () => {
  it("narrows the map when the feed is narrowed to Mine", () => {
    // The defect this pane exists to fix: All/Mine used to be the feed's own
    // state, so the map under the same heading kept painting all 62 tracers.
    const { container } = show();
    expect(mapIds()).toBe("0,1,2");

    fireEvent.click(screen.getByText("pages.match.filterFocal"));

    expect(feedNames(container)).toEqual(["Foe", "Me"]);
    expect(mapIds()).toBe("0,2");
  });

  it("narrows the feed when the time window is moved", () => {
    // The mirror of the above: the time range was the map's own state, so the
    // list below it went on showing kills from outside the window.
    const { container } = show();
    const [start] = screen.getAllByRole("slider");

    // 20 presses of one step each, so the window becomes [20, 100] and the
    // kill at 10 s falls out of it.
    for (let i = 0; i < 20; i += 1) {
      fireEvent.keyDown(start, { key: "ArrowRight", keyCode: 39, which: 39 });
    }

    expect(feedNames(container)).toEqual(["Bob", "Me"]);
    expect(mapIds()).toBe("1,2");
  });
});

describe("how many kills are on screen", () => {
  it("names the total when nothing is filtered out", () => {
    show();
    expect(screen.getByText('pages.match.killsTotal:{"total":3}')).toBeInTheDocument();
  });

  it("says how many of the total are showing once a filter bites", () => {
    show();
    fireEvent.click(screen.getByText("pages.match.filterFocal"));
    expect(screen.getByText('pages.match.killsShown:{"shown":2,"total":3}')).toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("says a match had no kills when the list arrives empty", () => {
    show({ kills: [] });
    expect(screen.getByText("pages.match.noKills")).toBeInTheDocument();
  });

  it("says the filter emptied the list, not that the match had no kills", () => {
    // Two different facts. "No kills recorded" under an active filter reads as
    // a broken page.
    show({ kills: [kills[1]] });
    fireEvent.click(screen.getByText("pages.match.filterFocal"));
    expect(screen.getByText("pages.match.noKillsFiltered")).toBeInTheDocument();
    expect(screen.queryByText("pages.match.noKills")).toBeNull();
  });
});

describe("pointing at a row", () => {
  it("hands the hovered row's kill to the map and takes it back on leave", () => {
    const { container } = show();
    const row = container.querySelectorAll(".kill-feed__row")[1];

    fireEvent.mouseEnter(row);
    expect(screen.getByTestId("map").getAttribute("data-highlight")).toBe("1");

    fireEvent.mouseLeave(row);
    expect(screen.getByTestId("map").getAttribute("data-highlight")).toBe("null");
  });

  it("highlights from the keyboard too, when a link in the row takes focus", () => {
    const { container } = show();
    const row = container.querySelectorAll(".kill-feed__row")[0];

    fireEvent.focus(within(row).getByRole("link", { name: "Me" }));
    expect(screen.getByTestId("map").getAttribute("data-highlight")).toBe("0");
  });

  it("keeps the identity of a kill after the list is filtered", () => {
    // The id is the index in the unfiltered list. Hovering the first row of a
    // filtered feed must highlight that kill, not whatever sits at index 0 of
    // the original.
    const { container } = show();
    fireEvent.click(screen.getByText("pages.match.filterFocal"));

    fireEvent.mouseEnter(container.querySelectorAll(".kill-feed__row")[1]);
    expect(screen.getByTestId("map").getAttribute("data-highlight")).toBe("2");
  });
});
