import { afterEach, describe, expect, it } from "vitest";
import { RANK_PRELOAD_GLOBAL, rankPreloadKey, takeRankPreload } from "./rankPreload";

afterEach(() => {
  delete globalThis[RANK_PRELOAD_GLOBAL];
});

const stash = (key, response) => {
  globalThis[RANK_PRELOAD_GLOBAL] = { key, response };
};

describe("rankPreloadKey", () => {
  it("identifies a lookup by the two things the URL carries", () => {
    expect(rankPreloadKey("steam", "PlayerA")).toBe("steam|PlayerA");
  });

  it("separates players whose names differ only where the separator sits", () => {
    expect(rankPreloadKey("steam", "a|b")).not.toBe(rankPreloadKey("steam|a", "b"));
  });
});

describe("takeRankPreload", () => {
  it("hands over the in-flight response when the page asks for the player it was started for", () => {
    const response = Promise.resolve("the-response");
    stash("steam|PlayerA", response);

    expect(takeRankPreload("steam|PlayerA")).toBe(response);
  });

  it("answers nothing when no preload ran", () => {
    expect(takeRankPreload("steam|PlayerA")).toBe(null);
  });

  it("answers nothing for a player the preload was not started for", () => {
    stash("steam|PlayerA", Promise.resolve("the-response"));

    expect(takeRankPreload("steam|PlayerB")).toBe(null);
  });

  // A response fetched once, at page load, must never satisfy a later lookup:
  // the page refetches to pick up matches played since, and handing back the
  // first answer again would freeze it.
  it("gives the response to the first asker only", () => {
    const response = Promise.resolve("the-response");
    stash("steam|PlayerA", response);

    expect(takeRankPreload("steam|PlayerA")).toBe(response);
    expect(takeRankPreload("steam|PlayerA")).toBe(null);
  });

  it("discards the preload even when the first asker wanted somebody else", () => {
    stash("steam|PlayerA", Promise.resolve("the-response"));

    takeRankPreload("steam|PlayerB");

    expect(takeRankPreload("steam|PlayerA")).toBe(null);
  });

  it("survives a global holding something that is not a preload", () => {
    globalThis[RANK_PRELOAD_GLOBAL] = "nonsense";

    expect(takeRankPreload("steam|PlayerA")).toBe(null);
  });
});
