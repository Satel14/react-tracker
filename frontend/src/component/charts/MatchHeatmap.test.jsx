import React from "react";
import { render, screen } from "@testing-library/react";
import MatchHeatmap from "./MatchHeatmap";

vi.mock("../../api/player", () => ({
  getMatchHeatmap: vi.fn(() =>
    Promise.resolve({
      data: {
        data: {
          matchId: "m1",
          rawMapName: "Baltic_Main",
          mapName: "Erangel",
          mapSize: 8160,
          events: [
            { type: "drop", x: 4000, y: 4000, time: 5 },
            { type: "kill", x: 4200, y: 4100, time: 60, victim: "Foe", weapon: "M416", distance: 50 },
          ],
        },
      },
    })
  ),
}));

test("renders the real map background once loaded", async () => {
  render(<MatchHeatmap open matchId="m1" shard="steam" accountId="account.1" playerName="Me" />);
  const img = await screen.findByRole("img", { name: /erangel/i });
  expect(img).toBeInTheDocument();
});
