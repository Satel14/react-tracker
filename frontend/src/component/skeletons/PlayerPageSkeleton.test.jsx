import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerPageSkeleton from "./PlayerPageSkeleton";

const renderSkeleton = (props = {}) =>
  render(<PlayerPageSkeleton label="Loading player…" {...props} />);

describe("PlayerPageSkeleton", () => {
  it("announces itself as busy status with its label", () => {
    renderSkeleton();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading player…");
  });

  it("carries playerpage--compact, the class every card style hangs off", () => {
    // Every card, grid and hero rule in style.scss is nested under
    // .playerpage--compact. A skeleton on a bare .playerpage inherits none of
    // that geometry, which is how the loader ended up nothing like the page.
    renderSkeleton();
    const status = screen.getByRole("status");
    expect(status).toHaveClass("playerpage");
    expect(status).toHaveClass("playerpage--compact");
  });

  it("reserves the action row above the hero card", () => {
    const { container } = renderSkeleton();
    expect(container.querySelector(".playerpage-buttons")).not.toBeNull();
  });

  it("mirrors the hero card: rank badge, progress track and identity", () => {
    const { container } = renderSkeleton();
    const header = container.querySelector(".player-card.player-card--header");
    expect(header).not.toBeNull();
    // The badge class is what sizes the box to 132x132; the tile has to wear it.
    expect(header.querySelector(".player-hero-rank .player-hero-rank__badge")).not.toBeNull();
    expect(header.querySelector(".player-hero-rank__progress")).not.toBeNull();
    expect(header.querySelector(".player-hero-main .player-identity__name")).not.toBeNull();
  });

  it("mirrors the quick-stat strip that gives the hero card its height", () => {
    const { container } = renderSkeleton();
    const quick = container.querySelector(".player-hero-main .player-quick-grid");
    expect(quick).not.toBeNull();
    expect(quick.querySelectorAll(".player-quick-stat")).toHaveLength(5);
  });

  it("reserves the tab bar that sits between the hero card and the first stat card", () => {
    const { container } = renderSkeleton();
    expect(container.querySelector(".player-tabs--loading")).not.toBeNull();
  });

  it("shows one stat card by default, the one the Overview tab opens on", () => {
    // The page renders a single card under the tabs, not a stack of them.
    const { container } = renderSkeleton();
    expect(container.querySelectorAll(".player-card")).toHaveLength(2);
  });

  it("lays out stat tiles in the same two grids as the real card", () => {
    // Tile counts decide the placeholder's height, so the page passes its own
    // rather than the skeleton guessing and drifting when an item is added.
    const { container } = renderSkeleton({ overviewTiles: 8, advancedTiles: 15, statCards: 1 });
    const grids = container.querySelectorAll(".player-stat-grid");
    expect(grids).toHaveLength(2);
    expect(grids[0].querySelectorAll(".player-stat-tile")).toHaveLength(8);
    expect(grids[1]).toHaveClass("player-stat-grid--dense");
    expect(grids[1].querySelectorAll(".player-stat-tile")).toHaveLength(15);
  });

  it("repeats the stat card as many times as the page shows", () => {
    const { container } = renderSkeleton({ statCards: 2 });
    // The header card is a .player-card too, hence the extra one.
    expect(container.querySelectorAll(".player-card")).toHaveLength(3);
  });

  it("hides every tile from assistive tech, leaving only the label", () => {
    const { container } = renderSkeleton();
    const tiles = [...container.querySelectorAll(".skeleton")];
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile).toHaveAttribute("aria-hidden", "true"));
  });
});
