import {
  CENSUS_SNAPSHOT,
  usableSnapshot,
  snapshotSeasonNumber,
  effectiveReadings,
} from "./censusSnapshot";
import committed from "../data/tierCensus.json";

const tier = (over = {}) => ({
  tier: "gold",
  count: 3788,
  share: 0.3,
  low: 0.28,
  high: 0.32,
  n: 12509,
  effectiveN: 2531,
  designEffect: 4.94,
  publishable: true,
  ...over,
});

const snapshot = (over = {}) => ({
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
  tiers: [tier()],
  ...over,
});

describe("usableSnapshot", () => {
  it("accepts a snapshot that can stand in the static HTML", () => {
    expect(usableSnapshot(snapshot())).toEqual(snapshot());
  });

  // The whole point of committing a snapshot is that a crawler and a cold
  // visitor read numbers rather than a loading line. A snapshot with nothing
  // publishable in it would bake the "collection has only just started"
  // sentence into the file instead -- a claim about this minute, frozen for as
  // long as nobody deploys. Better to fall back to the live read for that.
  it("refuses one with no publishable tier", () => {
    expect(usableSnapshot(snapshot({ tiers: [tier({ publishable: false })] }))).toBeNull();
    expect(usableSnapshot(snapshot({ tiers: [] }))).toBeNull();
  });

  it("refuses one that cannot date itself", () => {
    expect(usableSnapshot(snapshot({ firstDate: null }))).toBeNull();
    expect(usableSnapshot(snapshot({ lastDate: "" }))).toBeNull();
  });

  it("refuses one with no accounts behind it", () => {
    expect(usableSnapshot(snapshot({ accounts: 0 }))).toBeNull();
  });

  it("refuses anything that is not a snapshot at all", () => {
    for (const value of [null, undefined, 0, "", [], { tiers: "gold" }]) {
      expect(usableSnapshot(value)).toBeNull();
    }
  });
});

describe("snapshotSeasonNumber", () => {
  it("reads the season off the id PUBG uses", () => {
    expect(snapshotSeasonNumber(snapshot())).toBe("42");
    expect(snapshotSeasonNumber(snapshot({ seasonId: "division.bro.official.pc-2018-7" }))).toBe("7");
  });

  it("is empty rather than wrong when there is no id", () => {
    expect(snapshotSeasonNumber(snapshot({ seasonId: null }))).toBe("");
    expect(snapshotSeasonNumber(null)).toBe("");
  });
});

describe("effectiveReadings", () => {
  // The tightest of the publishable tiers, not the average: the sentence beside
  // the table says how much information the sample carries, and the honest
  // answer is the one that holds for every interval drawn from it.
  it("takes the smallest effective sample any published tier had", () => {
    const data = snapshot({
      tiers: [
        tier({ tier: "gold", effectiveN: 2531 }),
        tier({ tier: "diamond", effectiveN: 1910 }),
        tier({ tier: "unranked", effectiveN: 10592 }),
      ],
    });
    expect(effectiveReadings(data)).toBe(1900);
  });

  it("ignores tiers that were not published", () => {
    const data = snapshot({
      tiers: [tier({ effectiveN: 2531 }), tier({ tier: "survivor", effectiveN: 12, publishable: false })],
    });
    expect(effectiveReadings(data)).toBe(2500);
  });

  it("rounds to a figure that does not pretend to be exact", () => {
    expect(effectiveReadings(snapshot({ tiers: [tier({ effectiveN: 2549 })] }))).toBe(2500);
    expect(effectiveReadings(snapshot({ tiers: [tier({ effectiveN: 2550 })] }))).toBe(2600);
    // Under a thousand there is nothing to round off without losing the size.
    expect(effectiveReadings(snapshot({ tiers: [tier({ effectiveN: 864 })] }))).toBe(860);
  });

  it("is null when nothing was published", () => {
    expect(effectiveReadings(snapshot({ tiers: [] }))).toBeNull();
    expect(effectiveReadings(null)).toBeNull();
  });
});

// The file the daily census job commits. If it ever stops being usable the page
// silently drops back to the loading line for every crawler, so this is checked
// rather than assumed.
describe("the committed snapshot", () => {
  it("is the one the page ships with", () => {
    expect(CENSUS_SNAPSHOT).not.toBeNull();
    expect(CENSUS_SNAPSHOT).toEqual(usableSnapshot(committed));
  });

  it("is drawn from the PC shard the copy names", () => {
    expect(CENSUS_SNAPSHOT.shard).toBe("steam");
  });

  it("carries the window it was measured over", () => {
    expect(CENSUS_SNAPSHOT.firstDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CENSUS_SNAPSHOT.lastDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CENSUS_SNAPSHOT.lastDate >= CENSUS_SNAPSHOT.firstDate).toBe(true);
  });

  // A share that does not sit in [0, 1], or an interval that does not contain
  // its own share, would be drawn as a bar running off the track.
  it("holds shares and intervals that make sense", () => {
    for (const row of CENSUS_SNAPSHOT.tiers.filter((entry) => entry.publishable)) {
      expect(row.share, row.tier).toBeGreaterThan(0);
      expect(row.share, row.tier).toBeLessThanOrEqual(1);
      expect(row.low, row.tier).toBeLessThanOrEqual(row.share);
      expect(row.high, row.tier).toBeGreaterThanOrEqual(row.share);
    }
  });
});
