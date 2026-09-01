import { describe, test, expect } from "vitest";
import { pluralUa } from "./pluralUa";

const MATCH = ["матч", "матчі", "матчів"];

describe("pluralUa", () => {
  test("picks the singular for one and for every number ending in one", () => {
    for (const n of [1, 21, 31, 101]) expect(pluralUa(n, MATCH), String(n)).toBe("матч");
  });

  test("picks the few form for two to four and their higher echoes", () => {
    for (const n of [2, 3, 4, 22, 33, 44, 102]) expect(pluralUa(n, MATCH), String(n)).toBe("матчі");
  });

  test("picks the many form from five upwards and for the teens", () => {
    for (const n of [0, 5, 8, 11, 12, 13, 14, 19, 25, 111, 112]) {
      expect(pluralUa(n, MATCH), String(n)).toBe("матчів");
    }
  });

  test("falls back to the many form when the count is not a number", () => {
    for (const n of [null, undefined, "", Number.NaN]) expect(pluralUa(n, MATCH), String(n)).toBe("матчів");
  });
});
