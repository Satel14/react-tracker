import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RANK_LADDER, SURVIVOR_SLOTS } from "./rankLadder";

const publicFile = (url) =>
  fileURLToPath(new URL(`../../public${url}`, import.meta.url));

describe("the ladder this page publishes", () => {
  it("is the eight tiers KRAFTON's Season 42 reward table lists, in order", () => {
    expect(RANK_LADDER.map((tier) => tier.key)).toEqual([
      "bronze",
      "silver",
      "gold",
      "platinum",
      "crystal",
      "diamond",
      "master",
      "survivor",
    ]);
  });

  // The tier every third-party guide still prints and the game has not had
  // since the 2018 beta. Publishing it is the exact error this page exists to
  // correct, so it is worth a test of its own rather than only an ordering one.
  it("does not print Grandmaster, or Top 500", () => {
    const keys = RANK_LADDER.map((tier) => tier.key);
    expect(keys).not.toContain("grandmaster");
    expect(keys).not.toContain("top500");
  });

  it("puts Crystal between Platinum and Diamond", () => {
    const keys = RANK_LADDER.map((tier) => tier.key);
    expect(keys.indexOf("crystal")).toBe(keys.indexOf("platinum") + 1);
    expect(keys.indexOf("diamond")).toBe(keys.indexOf("crystal") + 1);
  });

  // Update 36.1 cut divisions from five to four. A 5 here would reprint the
  // number both stale incumbents still teach.
  it("gives every divided tier four divisions, never five", () => {
    for (const tier of RANK_LADDER) {
      expect([1, 4], tier.key).toContain(tier.divisions);
    }
    expect(RANK_LADDER.filter((tier) => tier.divisions === 1).map((t) => t.key)).toEqual([
      "master",
      "survivor",
    ]);
  });

  it("names an icon that is actually on disk for every tier", () => {
    for (const tier of RANK_LADDER) {
      expect(existsSync(publicFile(tier.iconUrl)), tier.key).toBe(true);
    }
  });
});

describe("survivor slots", () => {
  it("lists the seven PC regions from the Update 36.1 table", () => {
    expect(SURVIVOR_SLOTS.map((region) => region.key)).toEqual([
      "as",
      "sea",
      "eu",
      "kakao",
      "ru",
      "na",
      "sa",
    ]);
  });

  it("keeps the regions ordered by how many slots they get", () => {
    const slots = SURVIVOR_SLOTS.map((region) => region.slots);
    expect([...slots].sort((a, b) => b - a)).toEqual(slots);
  });
});
