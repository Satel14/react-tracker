import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Skeleton from "./Skeleton";

describe("Skeleton", () => {
  it("announces itself as busy status with its label", () => {
    render(<Skeleton label="Loading replay…" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading replay…");
  });

  it("renders one tile by default and hides tiles from assistive tech", () => {
    const { container } = render(<Skeleton label="Loading" />);
    const tiles = container.querySelectorAll(".skeleton");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the requested count and variant", () => {
    const { container } = render(<Skeleton variant="text" count={3} label="Loading" />);
    const tiles = container.querySelectorAll(".skeleton--text");
    expect(tiles).toHaveLength(3);
  });
});
