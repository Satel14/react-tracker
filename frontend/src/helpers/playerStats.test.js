import { describe, it, expect } from "vitest";
import { statNumber, statDisplay } from "./playerStats";

describe("statNumber", () => {
  it("returns the finite numeric value, including 0", () => {
    expect(statNumber({ kd: { value: 2.5 } }, "kd")).toBe(2.5);
    expect(statNumber({ kd: { value: 0 } }, "kd")).toBe(0);
    expect(statNumber({ kd: { value: "3.1" } }, "kd")).toBe(3.1);
  });
  it("returns null for missing/non-finite values", () => {
    expect(statNumber({}, "kd")).toBeNull();
    expect(statNumber(null, "kd")).toBeNull();
    expect(statNumber({ kd: { value: "x" } }, "kd")).toBeNull();
    expect(statNumber({ kd: {} }, "kd")).toBeNull();
  });
  it("returns null for a deliberately unknown stat instead of a fake zero", () => {
    expect(statNumber({ heals: { displayValue: "—", value: null } }, "heals")).toBeNull();
    expect(statNumber({ heals: { displayValue: "—", value: "" } }, "heals")).toBeNull();
  });
});

describe("statDisplay", () => {
  it("returns the displayValue when present", () => {
    expect(statDisplay({ kd: { displayValue: "2.50" } }, "kd", "0")).toBe("2.50");
  });
  it("returns the caller's fallback when missing", () => {
    expect(statDisplay({}, "kd", "0")).toBe("0");
    expect(statDisplay({}, "kd", "-")).toBe("-");
    expect(statDisplay(null, "kd", "-")).toBe("-");
  });
  it("lets an em dash through instead of the numeric fallback", () => {
    expect(statDisplay({ heals: { displayValue: "—", value: null } }, "heals", "0")).toBe("—");
    expect(statDisplay({ headshotRate: { displayValue: "—", value: null } }, "headshotRate", "0%")).toBe("—");
  });
});
