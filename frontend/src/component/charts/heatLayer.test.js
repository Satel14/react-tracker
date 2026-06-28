import { buildGradient, intensityAlpha } from "./heatLayer";

test("buildGradient returns a 256-entry RGBA ramp", () => {
  const ramp = buildGradient([
    [0.0, "#000000"],
    [1.0, "#ffffff"],
  ]);
  expect(ramp).toHaveLength(1024);
  expect(ramp[1020]).toBeGreaterThan(200); // near-white at the top
});

test("intensityAlpha scales with count and clamps to 1", () => {
  expect(intensityAlpha(0, 10)).toBe(0);
  expect(intensityAlpha(5, 10)).toBeCloseTo(0.5, 5);
  expect(intensityAlpha(20, 10)).toBe(1);
});
