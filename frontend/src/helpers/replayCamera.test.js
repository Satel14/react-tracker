import {
  MIN_ZOOM, MAX_ZOOM, baseScale, worldToScreen, screenToWorld,
  clampCamera, zoomAt, fitCamera, followCamera,
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

// --- follow ------------------------------------------------------------------
// The camera can track a player. The decision of where it should sit belongs
// here rather than in the component, so it can be reasoned about at the edges:
// a followed player who walks into a map corner must not drag the view off the
// world, and following must not fight a viewer who is dragging.

test("following centres the camera on the target", () => {
  // Well inside the map at this zoom, so the clamp has nothing to say and the
  // centring is what is being measured. The edge case is the next test.
  const cam = { ...fitCamera(8160), zoom: 3 };
  const next = followCamera(cam, 4200, 3600, 1200, 675);
  expect(next.cx).toBeCloseTo(4200, 6);
  expect(next.cy).toBeCloseTo(3600, 6);
});

test("following clamps at the map edge instead of showing the void", () => {
  const cam = { ...fitCamera(8160), zoom: 2 };
  const next = followCamera(cam, 0, 0, 1200, 675);
  const bare = clampCamera({ ...cam, cx: 0, cy: 0 }, 1200, 675);
  // Exactly what clampCamera would do -- follow adds no second opinion about
  // the edges, or the two would disagree and fight.
  expect(next.cx).toBeCloseTo(bare.cx, 6);
  expect(next.cy).toBeCloseTo(bare.cy, 6);
});

test("following preserves zoom and map size", () => {
  const cam = { ...fitCamera(8160), zoom: 4.5 };
  const next = followCamera(cam, 4000, 4000, 1200, 675);
  expect(next.zoom).toBe(4.5);
  expect(next.mapMax).toBe(8160);
});

test("a target with no position leaves the camera alone", () => {
  const cam = { ...fitCamera(8160), zoom: 3, cx: 1234, cy: 5678 };
  for (const [x, y] of [[NaN, 100], [100, NaN], [undefined, undefined]]) {
    const next = followCamera(cam, x, y, 1200, 675);
    expect(next.cx).toBe(1234);
    expect(next.cy).toBe(5678);
  }
});

test("following returns the same camera object when nothing moved", () => {
  // The frame loop compares identity to decide whether the background needs
  // redrawing, so a no-op follow must not look like a change.
  const cam = clampCamera({ ...fitCamera(8160), zoom: 3, cx: 4000, cy: 4000 }, 1200, 675);
  expect(followCamera(cam, cam.cx, cam.cy, 1200, 675)).toBe(cam);
});

test("zoom reaches a compound, not just a district", () => {
  // At the old cap of 6 a 1200x675 stage still showed 2.4 km across, which is
  // too wide to follow a fight. The markers are screen-sized, so zooming is
  // what separates players -- the reason the cap exists at all is the map
  // raster, and there is a sharper one behind it now.
  const cam = zoomAt(fitCamera(8160), 1200, 675, 999, 600, 337);
  expect(cam.zoom).toBe(MAX_ZOOM);
  const metresAcross = 1200 / (baseScale(1200, 675, 8160) * cam.zoom);
  expect(metresAcross).toBeLessThan(1000);
});
