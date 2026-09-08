import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchAnalysisSkeleton from "./MatchAnalysisSkeleton";

const renderSkeleton = (props = {}) =>
  render(<MatchAnalysisSkeleton label="Loading match…" {...props} />);

describe("MatchAnalysisSkeleton", () => {
  it("announces itself as busy status with its label", () => {
    renderSkeleton({ tab: "kills" });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading match…");
  });

  it("reserves the kill map through .map-stage, which is what squares it", () => {
    // The kill map is square via a padding-top:100% spacer on .map-stage, and
    // it is the tallest box on the tab. All four tabs used to share one stack
    // of six 120px dashes.
    const { container } = renderSkeleton({ tab: "kills" });
    const stage = container.querySelector(".kill-map .map-stage");
    expect(stage).not.toBeNull();
    expect(stage.querySelector(".skeleton.map-stage__bg")).not.toBeNull();
  });

  it("reserves the kill feed rows below the map", () => {
    const { container } = renderSkeleton({ tab: "kills", rows: 6 });
    const list = container.querySelector(".kill-feed .kill-feed__list");
    expect(list).not.toBeNull();
    expect(list.querySelectorAll(".kill-feed__row")).toHaveLength(6);
  });

  it("mirrors the damage tab's two region columns", () => {
    const { container } = renderSkeleton({ tab: "damage" });
    expect(screen.getByRole("status")).toHaveClass("damage");
    const cols = container.querySelectorAll(".damage__cols .damage__col");
    expect(cols).toHaveLength(2);
    // Five body regions per column, as in REGIONS.
    expect(cols[0].querySelectorAll(".damage__region")).toHaveLength(5);
  });

  it("mirrors the timeline tab's accuracy table and event list", () => {
    const { container } = renderSkeleton({ tab: "timeline", rows: 7 });
    expect(screen.getByRole("status")).toHaveClass("timeline");
    const accRows = container.querySelectorAll(".timeline__accuracy .timeline__acc-row");
    expect(accRows.length).toBeGreaterThan(1);
    expect(accRows[0]).toHaveClass("timeline__acc-row--head");
    // Four columns in the accuracy grid: weapon, shots, hits, percent.
    accRows.forEach((row) => expect(row.children).toHaveLength(4));
    expect(container.querySelectorAll(".timeline__events .timeline__event")).toHaveLength(7);
  });

  it("hides every tile from assistive tech, leaving only the label", () => {
    const { container } = renderSkeleton({ tab: "damage" });
    const tiles = [...container.querySelectorAll(".skeleton")];
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile).toHaveAttribute("aria-hidden", "true"));
  });
});
