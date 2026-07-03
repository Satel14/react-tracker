import { describe, it, expect } from "vitest";
import { formatClock } from "./formatClock";

describe("formatClock", () => {
  it("formats seconds as zero-padded MM:SS", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(3)).toBe("00:03");
    expect(formatClock(63)).toBe("01:03");
    expect(formatClock(303)).toBe("05:03");   // was "5:03" in MatchScoreboard
    expect(formatClock(3723)).toBe("62:03");  // minutes can exceed 60
  });

  it("clamps and floors invalid input to 00:00", () => {
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(NaN)).toBe("00:00");
    expect(formatClock(undefined)).toBe("00:00");
    expect(formatClock(12.9)).toBe("00:12");
  });
});
