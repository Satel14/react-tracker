import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AggregateHeatmap from "./AggregateHeatmap";

vi.mock("../../api/player", () => ({
  getAggregateHeatmap: vi.fn(() =>
    Promise.resolve({
      data: { map: "Baltic_Main", mapMax: 8160, matchesCount: 3, layers: { drop: [{ x: 1, y: 1 }], kill: [], death: [] } },
    })
  ),
}));

const t = (k, p) => (p ? `${k}:${p.count}` : k);

test("shows the sample count after loading", async () => {
  render(<AggregateHeatmap rawMapName="Baltic_Main" matches={[{ id: "m1", rawMapName: "Baltic_Main" }]} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  await waitFor(() => expect(screen.getByText("pages.maps.sampleCount:3")).toBeInTheDocument());
});
