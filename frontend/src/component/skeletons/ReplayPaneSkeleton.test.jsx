import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReplayPaneSkeleton from "./ReplayPaneSkeleton";

const renderSkeleton = (props = {}) =>
  render(<ReplayPaneSkeleton label="Loading replay…" {...props} />);

describe("ReplayPaneSkeleton", () => {
  it("announces itself as busy status with its label", () => {
    renderSkeleton();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading replay…");
  });

  it("reserves the stage through .replay-stage, which is what makes it 16:9", () => {
    // The stage is sized by a padding-top spacer on .replay-stage::before, so
    // wearing that class is the only way a placeholder gets the same box the
    // map will occupy. A plain 120px bar is what it looked like before.
    const { container } = renderSkeleton();
    const stage = container.querySelector(".match-replay__layout .match-replay__stage .replay-stage");
    expect(stage).not.toBeNull();
    // The tile fills the spacer the same way the real map layers do.
    expect(stage.querySelector(".skeleton.replay-stage__layer")).not.toBeNull();
  });

  it("reserves the controls row below the stage", () => {
    const { container } = renderSkeleton();
    const controls = container.querySelector(".match-replay__controls");
    expect(controls).not.toBeNull();
    expect(controls.querySelectorAll(".skeleton").length).toBeGreaterThan(1);
  });

  it("reserves the roster grid, sized by the same auto-fill columns", () => {
    const { container } = renderSkeleton({ teams: 4 });
    const teams = container.querySelector(".replay-roster .replay-roster__teams");
    expect(teams).not.toBeNull();
    expect(teams.querySelectorAll(".replay-roster__team")).toHaveLength(4);
  });

  it("hides every tile from assistive tech, leaving only the label", () => {
    const { container } = renderSkeleton();
    const tiles = [...container.querySelectorAll(".skeleton")];
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile).toHaveAttribute("aria-hidden", "true"));
  });
});
