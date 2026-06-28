import { buildGradient } from "./heatLayer";

test("buildGradient returns a 256-entry RGBA ramp", () => {
  const ramp = buildGradient([
    [0.0, "#000000"],
    [1.0, "#ffffff"],
  ]);
  expect(ramp).toHaveLength(1024);
  expect(ramp[1020]).toBeGreaterThan(200); // near-white at the top
});
