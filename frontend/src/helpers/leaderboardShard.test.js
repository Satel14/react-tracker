import { shardForRegion, DEFAULT_LEADERBOARD_SHARD } from "./leaderboardShard";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

test.each([
  ["pc-na", "steam"],
  ["pc-eu", "steam"],
  ["pc-as", "steam"],
  ["pc-sea", "steam"],
  ["pc-sa", "steam"],
  ["pc-kakao", "kakao"],
])("maps %s to the %s shard", (region, shard) => {
  expect(shardForRegion(region)).toBe(shard);
});

test("falls back to steam for an unknown region", () => {
  expect(shardForRegion("pc-oc")).toBe("steam");
});

test("falls back to steam for an empty string", () => {
  expect(shardForRegion("")).toBe(DEFAULT_LEADERBOARD_SHARD);
});

test("falls back to steam for null or undefined", () => {
  expect(shardForRegion(null)).toBe(DEFAULT_LEADERBOARD_SHARD);
  expect(shardForRegion(undefined)).toBe(DEFAULT_LEADERBOARD_SHARD);
});

test("warns when falling back so a new region can't silently break player links", () => {
  shardForRegion("pc-oc");
  expect(console.warn).toHaveBeenCalled();
});

test("is case-insensitive", () => {
  expect(shardForRegion("PC-KAKAO")).toBe("kakao");
});
