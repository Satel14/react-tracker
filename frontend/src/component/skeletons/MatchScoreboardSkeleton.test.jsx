import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchScoreboardSkeleton from "./MatchScoreboardSkeleton";

const renderSkeleton = (props = {}) =>
  render(<MatchScoreboardSkeleton label="Loading scoreboard…" {...props} />);

describe("MatchScoreboardSkeleton", () => {
  it("announces itself as busy status with its label", () => {
    renderSkeleton();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading scoreboard…");
  });

  it("is the .match-scoreboard container itself", () => {
    renderSkeleton();
    expect(screen.getByRole("status")).toHaveClass("match-scoreboard");
  });

  it("stands in with team cards, each with a head and a rows block", () => {
    const { container } = renderSkeleton({ teams: 3 });
    const cards = container.querySelectorAll(".match-scoreboard__team");
    expect(cards).toHaveLength(3);
    expect(cards[0].querySelector(".match-scoreboard__team-head")).not.toBeNull();
    expect(cards[0].querySelector(".match-scoreboard__rows")).not.toBeNull();
  });

  it("gives every row seven cells, because the row grid has seven columns", () => {
    // .match-scoreboard__row is grid-template-columns: 2fr repeat(6, 1fr). A row
    // with a different number of children lands its cells in the wrong columns,
    // so the placeholder would not line up with the table that replaces it.
    const { container } = renderSkeleton({ teams: 1, playersPerTeam: 4 });
    const rows = container.querySelectorAll(".match-scoreboard__row");
    expect(rows).toHaveLength(5); // one header row plus four players
    expect(rows[0]).toHaveClass("match-scoreboard__row--head");
    rows.forEach((row) => expect(row.children).toHaveLength(7));
  });

  it("hides every tile from assistive tech, leaving only the label", () => {
    const { container } = renderSkeleton();
    const tiles = [...container.querySelectorAll(".skeleton")];
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile).toHaveAttribute("aria-hidden", "true"));
  });
});
