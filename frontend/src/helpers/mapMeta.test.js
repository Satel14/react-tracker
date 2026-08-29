import { getMapMeta, worldToPercent, MAP_LIST, highResUrl } from "./mapMeta";

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
