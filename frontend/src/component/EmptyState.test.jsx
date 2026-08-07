import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("renders its message", () => {
    render(<EmptyState>No kills recorded.</EmptyState>);
    expect(screen.getByText("No kills recorded.")).toBeInTheDocument();
  });

  it("carries the shared class and any extra one", () => {
    const { container } = render(<EmptyState className="kill-feed__empty">x</EmptyState>);
    const node = container.querySelector(".empty-state");
    expect(node).not.toBeNull();
    expect(node.className).toContain("kill-feed__empty");
  });
});
