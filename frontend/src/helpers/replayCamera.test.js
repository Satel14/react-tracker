import {
  MIN_ZOOM, MAX_ZOOM, baseScale, worldToScreen, screenToWorld,
  clampCamera, zoomAt, fitCamera,
} from "./replayCamera";

const MAP = 8160;
const fit = () => fitCamera(MAP);

test("fitCamera centres the map at zoom 1", () => {
  expect(fit()).toEqual({ cx: MAP / 2, cy: MAP / 2, zoom: 1, mapMax: MAP });
});

test("baseScale contains the square map in the shorter viewport axis", () => {
  expect(baseScale(1168, 657, MAP)).toBeCloseTo(657 / MAP, 12);
  expect(baseScale(657, 1168, MAP)).toBeCloseTo(657 / MAP, 12);
});

test("worldToScreen letterboxes a square map in a 16:9 viewport at zoom 1", () => {
  const vw = 1600, vh = 900;
  const cam = fit();
  expect(worldToScreen(cam, vw, vh, 0, 0).x).toBeCloseTo((vw - vh) / 2, 9);
  expect(worldToScreen(cam, vw, vh, 0, 0).y).toBeCloseTo(0, 9);
  expect(worldToScreen(cam, vw, vh, MAP, MAP).y).toBeCloseTo(vh, 9);
});

test("screenToWorld inverts worldToScreen", () => {
  const cam = clampCamera({ cx: 3000, cy: 5000, zoom: 3.7, mapMax: MAP }, 1168, 657);
  const s = worldToScreen(cam, 1168, 657, 1234, 6543);
  const w = screenToWorld(cam, 1168, 657, s.x, s.y);
  expect(w.x).toBeCloseTo(1234, 6);
  expect(w.y).toBeCloseTo(6543, 6);
});

test("zoomAt keeps the anchored world point fixed", () => {
  const viewports = [[1600, 900], [900, 1600], [657, 657], [1168, 657]];
  const zooms = [1, 1.3, 2.5, 4, 6];
  const anchors = [[0, 0], [10, 400], [800, 450], [1599, 899]];
  for (const [vw, vh] of viewports) {
    for (const z0 of zooms) {
      for (const z1 of zooms) {
        for (const [px, py] of anchors) {
          const cam = clampCamera({ cx: MAP / 2, cy: MAP / 2, zoom: z0, mapMax: MAP }, vw, vh);
          const before = screenToWorld(cam, vw, vh, px, py);
          const next = zoomAt(cam, vw, vh, z1, px, py);
          // Only assert invariance when the clamp did not have to intervene.
          if (next.zoom !== z1) continue;
          const unclamped = { ...cam, zoom: z1,
            cx: cam.cx + (px - vw / 2) * (1 / (baseScale(vw, vh, MAP) * cam.zoom) - 1 / (baseScale(vw, vh, MAP) * z1)),
            cy: cam.cy + (py - vh / 2) * (1 / (baseScale(vw, vh, MAP) * cam.zoom) - 1 / (baseScale(vw, vh, MAP) * z1)) };
          if (unclamped.cx !== next.cx || unclamped.cy !== next.cy) continue;
          const after = screenToWorld(next, vw, vh, px, py);
          expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9);
          expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9);
        }
      }
    }
  }
});

test("zoomAt clamps to the zoom bounds", () => {
  expect(zoomAt(fit(), 1168, 657, 99, 100, 100).zoom).toBe(MAX_ZOOM);
  expect(zoomAt(fit(), 1168, 657, 0.01, 100, 100).zoom).toBe(MIN_ZOOM);
});

test("clampCamera never lets a map edge inside the viewport on the constrained axis", () => {
  const vw = 657, vh = 657;
  const cam = clampCamera({ cx: -9999, cy: 99999, zoom: 3, mapMax: MAP }, vw, vh);
  expect(worldToScreen(cam, vw, vh, 0, 0).x).toBeLessThanOrEqual(0);
  expect(worldToScreen(cam, vw, vh, MAP, MAP).y).toBeGreaterThanOrEqual(vh);
});

test("clampCamera centres an axis whose world extent is narrower than the viewport", () => {
  // 16:9 at zoom 1: the map's world width spans less than the viewport width.
  const cam = clampCamera({ cx: 10, cy: 10, zoom: 1, mapMax: MAP }, 1600, 900);
  expect(cam.cx).toBe(MAP / 2);
  expect(cam.cy).toBe(MAP / 2);
});
