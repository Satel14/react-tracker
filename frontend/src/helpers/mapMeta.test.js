import { describe, it, expect } from "vitest";
import { getMapMeta, worldToPercent, MAP_LIST, highResUrl, wantedRasterTier, HIGH_RES_SIZES } from "./mapMeta";

test("maps raw names to display names and mapMax", () => {
  expect(getMapMeta("Baltic_Main").displayName).toBe("Erangel");
  expect(getMapMeta("Savage_Main").mapMax).toBe(4080);
});

test("worldToPercent converts world coord to 0-100 along mapMax", () => {
  expect(worldToPercent(0, 8160)).toBe(0);
  expect(worldToPercent(8160, 8160)).toBe(100);
  expect(worldToPercent(4080, 8160)).toBe(50);
});

test("MAP_LIST contains Erangel once and excludes the legacy duplicate", () => {
  const erangel = MAP_LIST.filter((m) => m.displayName === "Erangel");
  expect(erangel).toHaveLength(1);
});

test("known maps resolve to an image asset", () => {
  expect(getMapMeta("Baltic_Main").image).toBeTruthy();
  expect(getMapMeta("Savage_Main").image).toBeTruthy();
});

test("highResUrl points at a versioned public raster for known maps", () => {
  expect(highResUrl("Baltic_Main")).toBe("/map-hi/erangel-2048.v1.webp");
  expect(highResUrl("Neon_Main")).toBe("/map-hi/rondo-2048.v1.webp");
  expect(highResUrl("Range_Main")).toBe("/map-hi/camp_jackal-2048.v1.webp");
});

test("highResUrl is null for an unknown map", () => {
  expect(highResUrl("Not_A_Map")).toBeNull();
});

test("each raster tier has its own url, and an unknown size has none", () => {
  // The 4096 tier is what makes the far end of the zoom range worth having;
  // asking for a size we never generated must be a miss, not a 404 at runtime.
  expect(highResUrl("Baltic_Main")).toBe("/map-hi/erangel-2048.v1.webp");
  expect(highResUrl("Baltic_Main", 2048)).toBe("/map-hi/erangel-2048.v1.webp");
  expect(highResUrl("Baltic_Main", 4096)).toBe("/map-hi/erangel-4096.v1.webp");
  expect(highResUrl("Baltic_Main", 8192)).toBeNull();
  expect(highResUrl("Nope_Main", 4096)).toBeNull();
});

// Which raster tier a view wants. Lived inside ReplayStage; the kill map needs
// the same answer, and two copies of it would drift the moment one map's
// trigger was tuned.
describe("wantedRasterTier", () => {
  it("asks for the base raster until the view samples past the trigger", () => {
    // 900px at dpr 1 and zoom 1 samples well inside the 2048 tier.
    expect(wantedRasterTier({ vw: 1600, vh: 900, dpr: 1, zoom: 1 })).toBe(0);
  });

  it("climbs as the view zooms in", () => {
    const at = (zoom, dpr = 1) => wantedRasterTier({ vw: 1600, vh: 900, dpr, zoom });
    expect(at(2)).toBe(1);
    expect(at(8)).toBe(HIGH_RES_SIZES.length);
    // A retina display samples twice as hard at the same zoom, so it climbs
    // sooner -- which is the whole reason dpr is in the sum.
    expect(at(1, 2)).toBeGreaterThan(at(1, 1));
  });

  it("never asks for a tier that does not exist", () => {
    expect(wantedRasterTier({ vw: 4000, vh: 4000, dpr: 3, zoom: 16 })).toBe(HIGH_RES_SIZES.length);
  });

  it("treats a degenerate view as wanting nothing better", () => {
    for (const v of [{}, { vw: 0, vh: 0, dpr: 0, zoom: 0 }, { vw: NaN, vh: 900, dpr: 1, zoom: 1 }]) {
      expect(wantedRasterTier(v)).toBe(0);
    }
  });
});
