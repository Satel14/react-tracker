import { CENSUS_DATA_FILES, censusJson, censusCsv } from "./censusDataFiles";

const SNAPSHOT = {
  capturedAt: "2026-09-07T18:58:25Z",
  seasonId: "division.bro.official.pc-2018-42",
  current: true,
  shard: "steam",
  days: 7,
  accounts: 12509,
  matches: 845,
  windows: 7,
  firstDate: "2026-08-30",
  lastDate: "2026-09-05",
  perMatch: 15,
  tiers: [
    { tier: "gold", count: 3788, share: 0.3, low: 0.28, high: 0.32, n: 12509, effectiveN: 2531, designEffect: 4.94, publishable: true },
    { tier: "survivor", count: 3, share: 0.00024, low: 0.00008, high: 0.0007, n: 12509, effectiveN: 12509, designEffect: 1, publishable: false },
  ],
};

describe("censusJson", () => {
  it("publishes the snapshot as it stands, plus where it came from", () => {
    const parsed = JSON.parse(censusJson(SNAPSHOT));
    expect(parsed.tiers).toEqual(SNAPSHOT.tiers);
    expect(parsed.accounts).toBe(12509);
    // Somebody who finds the file has to be able to get back to the method.
    expect(parsed.source).toBe("https://www.pubgtracker.top/ranks");
    expect(parsed.method).toMatch(/ranked match/i);
  });

  it("keeps a tier that was not published, flagged rather than dropped", () => {
    const parsed = JSON.parse(censusJson(SNAPSHOT));
    const survivor = parsed.tiers.find((row) => row.tier === "survivor");
    expect(survivor.publishable).toBe(false);
    expect(survivor.count).toBe(3);
  });

  it("ends with a newline, like every other file we write", () => {
    expect(censusJson(SNAPSHOT).endsWith("\n")).toBe(true);
  });
});

describe("censusCsv", () => {
  const lines = () => censusCsv(SNAPSHOT).trim().split("\n");

  it("names every column, with the window on each row", () => {
    expect(lines()[0]).toBe(
      "season_id,shard,window_from,window_to,accounts,matches,tier,count,share,ci_low,ci_high,effective_n,design_effect,publishable",
    );
  });

  it("writes one row per tier", () => {
    expect(lines()).toHaveLength(1 + SNAPSHOT.tiers.length);
    expect(lines()[1]).toBe(
      "division.bro.official.pc-2018-42,steam,2026-08-30,2026-09-05,12509,845,gold,3788,0.3,0.28,0.32,2531,4.94,true",
    );
  });

  it("says outright when a tier's number was not published", () => {
    expect(lines()[2]).toMatch(/,survivor,3,.*,false$/);
  });

  it("holds no field that would need quoting", () => {
    for (const line of lines()) expect(line).not.toMatch(/["\r]/);
  });
});

// What the build writes into the deployed site. Named here rather than in
// vite.config.js so the paths are testable and the config has no copy of them.
describe("CENSUS_DATA_FILES", () => {
  it("publishes both formats under /data", () => {
    expect(CENSUS_DATA_FILES.map((file) => file.path)).toEqual([
      "data/tier-census.json",
      "data/tier-census.csv",
    ]);
  });

  it("renders each one from the committed snapshot", () => {
    for (const file of CENSUS_DATA_FILES) {
      expect(typeof file.body, file.path).toBe("string");
      expect(file.body.length, file.path).toBeGreaterThan(200);
    }
    expect(CENSUS_DATA_FILES[1].body).toContain("season_id,shard,");
  });
});
