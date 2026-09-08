import React from "react";
import { beforeEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaderboardSkeleton from "./LeaderboardSkeleton";

// antd's Table subscribes to responsive breakpoints on mount.
beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
});

const columns = [
  { title: "Rank", dataIndex: "rank", key: "rank", width: 64 },
  { title: "Player", dataIndex: "name", key: "name" },
  { title: "RP", dataIndex: "rankPoints", key: "rankPoints" },
];

const renderSkeleton = (props = {}) =>
  render(<LeaderboardSkeleton label="Loading leaderboard…" columns={columns} {...props} />);

describe("LeaderboardSkeleton", () => {
  it("announces itself as busy status with its label", () => {
    renderSkeleton();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading leaderboard…");
  });

  it("keeps the real header row, so the columns land where they will stay", () => {
    // The standings are an antd Table whose column widths come from the header.
    // Ten 120px dashes told the reader nothing about where the table would be.
    const { container } = renderSkeleton();
    const headers = [...container.querySelectorAll(".ant-table-thead th")].map((th) => th.textContent);
    // Leading blank is the selection column antd prepends for rowSelection.
    expect(headers).toEqual(["", "Rank", "Player", "RP"]);
  });

  it("fills the requested number of rows with one tile per column", () => {
    const { container } = renderSkeleton({ rows: 10 });
    const bodyRows = container.querySelectorAll(".ant-table-tbody tr.ant-table-row");
    expect(bodyRows).toHaveLength(10);
    expect(bodyRows[0].querySelectorAll(".skeleton")).toHaveLength(columns.length);
  });

  it("leaves room for the selection column the real table adds", () => {
    // The standings pass rowSelection, so antd prepends a checkbox column.
    // Without it here, every column jumps sideways when the data lands.
    const { container } = renderSkeleton({ rows: 3 });
    const header = container.querySelector(".ant-table-thead tr");
    expect(header.querySelector(".ant-table-selection-column")).not.toBeNull();
    container.querySelectorAll(".ant-table-tbody tr.ant-table-row").forEach((row) => {
      expect(row.querySelector(".ant-table-selection-column")).not.toBeNull();
    });
    // Nothing to select yet, so the boxes must not invite a click.
    const boxes = [...container.querySelectorAll(".ant-table-tbody input[type=checkbox]")];
    expect(boxes).toHaveLength(3);
    boxes.forEach((box) => expect(box).toBeDisabled());
  });

  it("wears the page's own table class so its width and scroll match", () => {
    const { container } = renderSkeleton();
    expect(container.querySelector(".leaderboard-page__table")).not.toBeNull();
  });

  it("hides every tile from assistive tech, leaving only the label", () => {
    const { container } = renderSkeleton();
    const tiles = [...container.querySelectorAll(".skeleton")];
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile).toHaveAttribute("aria-hidden", "true"));
  });
});
