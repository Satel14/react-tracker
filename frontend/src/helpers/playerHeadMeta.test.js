import { describe, it, expect } from "vitest";
import { playerHeadMeta } from "./playerHeadMeta";
import { SITE_ORIGIN } from "./routeMeta";

const meta = (path) => playerHeadMeta(path);

describe("paths it has an opinion about", () => {
  it("gives a player page the player's own title and canonical", () => {
    const result = meta("/player/steam/shroud");
    expect(result.title).toBe("shroud - PUBG stats, ranked RP and match history");
    expect(result.canonical).toBe(`${SITE_ORIGIN}/player/steam/shroud`);
    expect(result.robots).toBe("noindex, follow");
    expect(result.description).toContain("shroud");
  });

  it("decodes a percent-encoded name", () => {
    // profileLink.js builds every path with encodeURIComponent, so a name with
    // a space arrives encoded and must read as a name again.
    expect(meta("/player/xbox/FF%20Slaay").title).toBe(
      "FF Slaay - PUBG stats, ranked RP and match history",
    );
  });

  it("keeps the name's own casing in the canonical", () => {
    // PUBG resolves names case-insensitively, but two casings are two URLs and
    // we cannot tell from the path alone which one the player actually uses.
    // Lower-casing here would point one player's page at another's URL.
    expect(meta("/player/steam/SHROUD").canonical).toBe(`${SITE_ORIGIN}/player/steam/SHROUD`);
  });

  it("normalises the platform the way the rest of the app does", () => {
    expect(meta("/player/xbl/someone").canonical).toBe(`${SITE_ORIGIN}/player/xbox/someone`);
  });

  it("covers every platform the search box offers", () => {
    for (const platform of ["steam", "xbox", "psn", "kakao", "stadia"]) {
      expect(meta(`/player/${platform}/name`), platform).not.toBeNull();
    }
  });

  it("titles a match replay without pretending to know the players", () => {
    const result = meta("/match/steam/abc-123/replay");
    expect(result.title).toBe("PUBG match replay - map, drops and the final circle");
    expect(result.canonical).toBe(`${SITE_ORIGIN}/match/steam/abc-123/replay`);
    expect(result.robots).toBe("noindex, follow");
  });

  it("keeps the OBS overlay out of the index", () => {
    const result = meta("/overlay/steam/shroud");
    expect(result.robots).toContain("noindex");
    expect(result.title).toContain("overlay");
  });
});

// Every /player/* URL reaches the function, including ones the router will not
// match. Returning nothing for those would leave them on the homepage's title
// and the homepage's canonical, which is the exact defect this fixes.
describe("paths under its prefixes that are not real pages", () => {
  it.each([
    ["/player/steam", "a platform with no name"],
    ["/player/steam/", "a trailing slash and no name"],
    ["/player/steam/a/b", "more segments than the route takes"],
    ["/player/", "nothing at all"],
    ["/player/nintendo/someone", "a platform that does not exist"],
    ["/player/steam/account.fa405e76bea343a59dc8bc4d3cece7a6", "an account id, not a handle"],
  ])("gives %s a generic head rather than the homepage's", (path) => {
    const result = meta(path);
    expect(result).not.toBeNull();
    expect(result.robots).toContain("noindex");
    expect(result.title).not.toMatch(/undefined|null/);
    expect(result.canonical).toBeUndefined();
  });
});

describe("paths it must not touch", () => {
  it.each(["/", "/help", "/leaderboards", "/assets/index-abc123.js", "/og.png", "/sitemap.xml"])(
    "leaves %s alone",
    (path) => {
      expect(meta(path)).toBeNull();
    },
  );
});

describe("hostile names", () => {
  // The name is user-controlled and lands in an attribute and in a title. The
  // rewriter escapes what it writes, but a name that is not a name at all
  // should never reach it with a confident, indexable head.
  it.each([
    ['/player/steam/%3Cscript%3Ealert(1)%3C%2Fscript%3E', "a script tag"],
    ['/player/steam/%22%3E%3Cimg%20src%3Dx%3E', "an attribute break-out"],
    ["/player/steam/%00", "a null byte"],
    ["/player/steam/%0Aname", "a newline"],
  ])("refuses %s a player head", (path) => {
    const result = meta(path);
    expect(result.robots).toContain("noindex");
    expect(result.title).toBe(playerHeadMeta("/player/steam").title);
  });

  it("refuses a name longer than the API would ever accept", () => {
    const long = "a".repeat(65);
    expect(meta(`/player/steam/${long}`).title).toBe(playerHeadMeta("/player/steam").title);
  });

  it("accepts the names the API does accept, including non-latin ones", () => {
    // The backend takes up to 64 characters of any charset, so an ASCII-only
    // rule here would strand every Kakao and Cyrillic player on a generic head.
    for (const name of ["Ostap", "Гравець", "선수", "FF Slaay", "a-b_c"]) {
      const result = meta(`/player/steam/${encodeURIComponent(name)}`);
      expect(result.title, name).toBe(`${name} - PUBG stats, ranked RP and match history`);
    }

    // 64 characters is the backend's own limit, so it is a real name -- it just
    // cannot survive a 60-character title intact.
    const longest = meta(`/player/steam/${"x".repeat(64)}`);
    expect(longest.canonical).toContain("x".repeat(64));
    expect(longest.title).not.toBe(playerHeadMeta("/player/steam").title);
  });

  it("survives a malformed percent-encoding without throwing", () => {
    expect(() => meta("/player/steam/%E0%A4%A")).not.toThrow();
    expect(meta("/player/steam/%E0%A4%A").robots).toContain("noindex");
  });
});

describe("titles fit a search result", () => {
  it("truncates a long name rather than running past the cut", () => {
    const result = meta(`/player/steam/${"n".repeat(40)}`);
    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.title).toContain("…");
  });

  it.each(["/player/steam/shroud", "/match/steam/abc/replay", "/player/steam", "/overlay/steam/x"])(
    "keeps %s inside the usual limits",
    (path) => {
      const result = meta(path);
      expect(result.title.length).toBeLessThanOrEqual(60);
      expect(result.description.length).toBeLessThanOrEqual(155);
      expect(result.description.length).toBeGreaterThan(49);
    },
  );
});
