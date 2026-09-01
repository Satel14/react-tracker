import { describe, it, expect } from "vitest";
import { rpPercentile } from "./rankPercentile";

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
