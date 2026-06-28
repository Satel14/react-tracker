import React from "react";
import { render, screen } from "@testing-library/react";
import MapsTab from "./MapsTab";

vi.mock("../component/charts/AggregateHeatmap", () => ({ default: () => <div data-testid="aggregate" /> }));

const t = (k) => k;
const matches = [{ id: "m1", mapName: "Erangel", rawMapName: "Baltic_Main", gameModeLabel: "SQUAD" }];

test("shows the explanatory caption", () => {
  render(<MapsTab matches={matches} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  expect(screen.getByText("pages.maps.description")).toBeInTheDocument();
});

test("renders the aggregate heatmap", () => {
  render(<MapsTab matches={matches} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  expect(screen.getByTestId("aggregate")).toBeInTheDocument();
});
