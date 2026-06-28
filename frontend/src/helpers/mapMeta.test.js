import { getMapMeta, worldToPercent, MAP_LIST } from "./mapMeta";

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
