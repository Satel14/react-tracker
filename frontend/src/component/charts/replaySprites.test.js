import { buildAtlas, ICON_PATHS } from "./replaySprites";

const COLORS = { focal: "rgb(1,1,1)", enemy: "rgb(2,2,2)", dead: "rgb(3,3,3)" };

test("exposes a path string per icon kind", () => {
  expect(Object.keys(ICON_PATHS).sort()).toEqual(["dead", "enemy", "focal"]);
  for (const d of Object.values(ICON_PATHS)) expect(typeof d).toBe("string");
});

test("returns null when the environment has no Path2D, so callers never blit unsafely", () => {
  // jsdom defines neither Path2D nor a 2D context.
  const atlas = buildAtlas({ dpr: 2, colors: COLORS });
  expect(atlas).toBeNull();
});
