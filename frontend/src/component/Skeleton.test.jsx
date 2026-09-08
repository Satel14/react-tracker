import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkeletonFrame, SkeletonTile, SKELETON_VARIANTS } from "./Skeleton";

describe("SkeletonFrame", () => {
  it("announces itself as busy status with its label", () => {
    render(
      <SkeletonFrame label="Loading scoreboard…">
        <SkeletonTile />
      </SkeletonFrame>
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading scoreboard…");
  });

  it("becomes the caller's own container so the real layout's CSS applies to it", () => {
    // The whole point of the frame: a skeleton mirrors the geometry of what it
    // stands in for by BEING that container, not by sitting in a wrapper of its
    // own with sizes of its own.
    render(
      <SkeletonFrame className="match-scoreboard" label="Loading">
        <div className="match-scoreboard__team" />
      </SkeletonFrame>
    );
    const status = screen.getByRole("status");
    expect(status).toHaveClass("match-scoreboard");
    expect(status.querySelector(".match-scoreboard__team")).not.toBeNull();
  });
});

describe("SkeletonTile", () => {
  it("hides itself from assistive tech, so only the frame's label is read out", () => {
    const { container } = render(<SkeletonTile variant="cell" />);
    const tile = container.querySelector(".skeleton");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveClass("skeleton--cell");
  });

  it("renders a class per declared variant", () => {
    SKELETON_VARIANTS.forEach((variant) => {
      const { container } = render(<SkeletonTile variant={variant} />);
      expect(container.querySelector(`.skeleton--${variant}`)).not.toBeNull();
    });
  });
});
