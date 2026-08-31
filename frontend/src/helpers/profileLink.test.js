import { describe, it, expect } from "vitest";
import { profilePath, profilePathByName } from "./profileLink";

describe("profilePath", () => {
  it("links a real player by name", () => {
    expect(profilePath("steam", "Satel14", "account.abc")).toBe("/player/steam/Satel14");
  });

  it("refuses a bot", () => {
    // 92 of the 100 entrants in a real match are AI. Their names look exactly
    // like a person's, so linking on the name alone is 92 dead links in every
    // scoreboard -- the account id is the only thing that tells them apart.
    expect(profilePath("steam", "Bot_Frank", "ai.1031")).toBeNull();
    expect(profilePath("steam", "Frank", "ai.2833")).toBeNull();
  });

  it("refuses a player whose name the telemetry never learned", () => {
    // The backend falls a missing name back to the account id, and
    // /player/steam/account.abc is not a profile anybody can open.
    expect(profilePath("steam", "account.abc", "account.abc")).toBeNull();
  });

  it("refuses when there is no account id to vouch for the name", () => {
    for (const id of [null, undefined, "", "unknown", 7]) {
      expect(profilePath("steam", "Satel14", id)).toBeNull();
    }
  });

  it("refuses without a name to build a path from", () => {
    expect(profilePath("steam", "", "account.abc")).toBeNull();
    expect(profilePath("steam", null, "account.abc")).toBeNull();
  });

  it("falls a missing platform back to steam, the way every other link does", () => {
    // normalizePlatform defaults rather than failing, and this follows it
    // instead of inventing a stricter rule for one link.
    expect(profilePath("", "Satel14", "account.abc")).toBe("/player/steam/Satel14");
    expect(profilePath(undefined, "Satel14", "account.abc")).toBe("/player/steam/Satel14");
    expect(profilePath("xbl", "Satel14", "account.abc")).toBe("/player/xbox/Satel14");
  });

  it("escapes a name that would otherwise break the path", () => {
    expect(profilePath("steam", "a b/c?d", "account.abc")).toBe("/player/steam/a%20b%2Fc%3Fd");
  });

  it("normalises the platform the way every other link does", () => {
    expect(profilePath("Steam", "Satel14", "account.abc")).toBe("/player/steam/Satel14");
  });
});

describe("profilePathByName", () => {
  it("links a name with no account id behind it", () => {
    // For the one surface that has no ids to check: pubg.report answers with
    // names only. Everywhere an id IS available, profilePath is the one to use.
    expect(profilePathByName("steam", "Satel14")).toBe("/player/steam/Satel14");
  });

  it("still refuses a name that is itself an account id, or no name at all", () => {
    expect(profilePathByName("steam", "account.abc")).toBeNull();
    expect(profilePathByName("steam", "")).toBeNull();
    expect(profilePathByName("steam", null)).toBeNull();
    expect(profilePathByName("steam", "Unknown")).toBeNull();
  });

  it("escapes the name, the same as the guarded one", () => {
    expect(profilePathByName("steam", "a b/c")).toBe("/player/steam/a%20b%2Fc");
  });

  it("cannot tell a bot apart, which is the whole reason it is named apart", () => {
    // profilePath would refuse this; this one cannot, because it has nothing
    // to refuse it on. A bot's name here links to a "not found" page.
    expect(profilePathByName("steam", "Bot_Frank")).toBe("/player/steam/Bot_Frank");
    expect(profilePath("steam", "Bot_Frank", "ai.1031")).toBeNull();
  });
});
