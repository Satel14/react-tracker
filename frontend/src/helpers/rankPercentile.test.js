import { describe, it, expect } from "vitest";
import { rpPercentile, RP_CUTS, rpCuts, rpMedian } from "./rankPercentile";

// The endpoint ships 101 RP thresholds, highest first, so the index a player's
// RP lands on IS their "top n%". These tables are built the same way.
const table = (top, bottom) =>
  Array.from({ length: 101 }, (_, i) => Math.round(top - ((top - bottom) * i) / 100));

const LADDER = table(3600, 1000);

describe("placing an RP against the sample", () => {
  it("puts the highest RP in the top one per cent", () => {
    expect(rpPercentile(LADDER[0], LADDER)).toBe(1);
  });

  it("puts an RP above the whole sample in the top one per cent too", () => {
    expect(rpPercentile(LADDER[0] + 500, LADDER)).toBe(1);
  });

  it("puts the median at fifty", () => {
    expect(rpPercentile(LADDER[50], LADDER)).toBe(50);
  });

  it("reads a value between two thresholds as the lower standing", () => {
    // Between the 20th and 21st thresholds: not yet top 20%.
    const between = LADDER[21] + 1;
    expect(rpPercentile(between, LADDER)).toBe(21);
  });

  it("puts the lowest RP at ninety-nine", () => {
    expect(rpPercentile(LADDER[100], LADDER)).toBe(99);
  });

  it("puts an RP below the whole sample at ninety-nine as well", () => {
    expect(rpPercentile(LADDER[100] - 500, LADDER)).toBe(99);
  });

  // Nobody is "top 0%" and nobody is "top 100%" -- both read as claims this
  // sample cannot make.
  it("never claims nought or a hundred", () => {
    for (const rp of [0, 500, 1000, 2300, 3600, 9999]) {
      const at = rpPercentile(rp, LADDER);
      expect(at, `rp ${rp}`).toBeGreaterThanOrEqual(1);
      expect(at, `rp ${rp}`).toBeLessThanOrEqual(99);
    }
  });

  it("never rewards less RP with a better standing", () => {
    let previous = 100;
    for (let rp = 800; rp <= 3800; rp += 25) {
      const at = rpPercentile(rp, LADDER);
      expect(at, `rp ${rp}`).toBeLessThanOrEqual(previous);
      previous = at;
    }
  });
});

describe("when it cannot answer", () => {
  it("says nothing without a table", () => {
    expect(rpPercentile(2400, null)).toBeNull();
    expect(rpPercentile(2400, [])).toBeNull();
    expect(rpPercentile(2400, [2400])).toBeNull();
  });

  it("says nothing without a rank point", () => {
    expect(rpPercentile(null, LADDER)).toBeNull();
    expect(rpPercentile(undefined, LADDER)).toBeNull();
    expect(rpPercentile("", LADDER)).toBeNull();
    expect(rpPercentile("gold", LADDER)).toBeNull();
  });

  // Zero RP is a real reading for somebody who has just placed, and it is not
  // the same as having no reading at all.
  it("still answers for nought RP", () => {
    expect(rpPercentile(0, LADDER)).toBe(99);
  });
});

// A table whose value equals its own index, so an assertion can check the
// index arithmetic directly: "above N% of players" is the top (100 - N)%, and
// the table is indexed by exactly that.
const indexTable = Array.from({ length: 101 }, (_, i) => 100 - i);

describe("rpCuts", () => {
  it("cuts at nine places, counted upwards and descending down the table", () => {
    expect(RP_CUTS).toEqual([99, 95, 90, 75, 50, 25, 10, 5, 1]);
    const cuts = rpCuts(indexTable);
    expect(cuts.map((cut) => cut.above)).toEqual(RP_CUTS);
  });

  // On this table index i holds 100 - i, so the RP at "above N%" is N itself.
  // That pins the mapping rather than restating it.
  it("reads each cut off the index its share corresponds to", () => {
    for (const cut of rpCuts(indexTable)) expect(cut.rp, `above ${cut.above}`).toBe(cut.above);
  });

  it("descends in RP as the share it beats descends", () => {
    const rps = rpCuts(indexTable).map((cut) => cut.rp);
    for (let i = 1; i < rps.length; i += 1) expect(rps[i]).toBeLessThanOrEqual(rps[i - 1]);
  });

  it("returns nothing to render when there is no usable table", () => {
    expect(rpCuts(null)).toEqual([]);
    expect(rpCuts([])).toEqual([]);
    expect(rpCuts([2000])).toEqual([]);
    expect(rpCuts(undefined)).toEqual([]);
  });
});

describe("rpMedian", () => {
  it("is the reading half the sample sits below", () => {
    expect(rpMedian(indexTable)).toBe(50);
  });

  it("is null when there is no table", () => {
    expect(rpMedian(null)).toBeNull();
    expect(rpMedian([2000])).toBeNull();
  });
});
