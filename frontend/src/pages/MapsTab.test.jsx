import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MapsTab from "./MapsTab";

vi.mock("../api/player", () => ({
  getMatchHeatmap: vi.fn(() => Promise.resolve({ data: { data: { rawMapName: "Baltic_Main", mapName: "Erangel", events: [] } } })),
}));

vi.mock("../component/charts/AggregateHeatmap", () => ({ default: () => <div data-testid="aggregate" /> }));

const t = (k) => k;
const matches = [
  { id: "m1", mapName: "Erangel", rawMapName: "Baltic_Main", gameModeLabel: "SQUAD", createdAt: "2026-06-20T10:00:00Z" },
];

test("renders a match selector", () => {
  render(<MapsTab matches={matches} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  expect(screen.getByText("pages.maps.selectMatch")).toBeInTheDocument();
});

test("switches to aggregate mode", () => {
  render(<MapsTab matches={matches} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  fireEvent.click(screen.getByText("pages.maps.modeAggregate"));
  expect(screen.getByTestId("aggregate")).toBeInTheDocument();
});
