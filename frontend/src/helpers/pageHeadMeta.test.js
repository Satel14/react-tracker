import { describe, it, expect } from "vitest";
import { pageHeadMeta } from "./pageHeadMeta";
import { ROUTE_META, SITE_ORIGIN } from "./routeMeta";

describe("a page the build already wrote a file for", () => {
  // Those files carry a title, description and canonical the build put there
  // and verified. Rewriting them at the edge could only make them wrong.
  it.each(ROUTE_META.map((r) => r.path))("leaves %s untouched", (path) => {
    expect(pageHeadMeta(path)).toBeNull();
  });
});

describe("the parameterised routes", () => {
  it("still hands a player page its own head", () => {
    const meta = pageHeadMeta("/player/steam/shroud");
    expect(meta.title).toContain("shroud");
    expect(meta.canonical).toBe(`${SITE_ORIGIN}/player/steam/shroud`);
    expect(meta.robots).toBe("noindex, follow");
  });

  it("still hands a replay and an overlay theirs", () => {
    expect(pageHeadMeta("/match/steam/abc/replay").robots).toBe("noindex, follow");
    expect(pageHeadMeta("/overlay/steam/shroud").robots).toBe("noindex, nofollow");
  });
});

// Cloudflare Pages answers every unmatched path with the homepage's file, so
// until now a typo answered 200 saying "index me, and by the way I am the
// homepage". That was survivable while the file was empty. It stops being
// survivable the moment the homepage carries real prose, because the prose
// rides along to every one of them.
describe("a path the router does not serve", () => {
  const missing = () => pageHeadMeta("/zzz-not-a-page");

  it("tells Google not to index it", () => {
    expect(missing().robots).toContain("noindex");
  });

  it("claims no canonical of its own", () => {
    // Not a canonical pointing at the homepage either: that invites Google to
    // treat the junk URL as a version of the homepage rather than as nothing.
    expect(missing().canonical).toBeUndefined();
  });

  it("says what it is rather than borrowing the homepage's title", () => {
    expect(missing().title).toMatch(/not found/i);
    expect(missing().description.length).toBeGreaterThan(20);
  });

  it("covers the error route the build deliberately writes no file for", () => {
    // /404 is a real router path with no shell of its own -- Pages must never
    // see a top-level 404.html -- so it arrives here like any unmatched URL.
    expect(pageHeadMeta("/404").robots).toContain("noindex");
  });

  it("keeps following, so the crawler still walks to the real pages", () => {
    expect(missing().robots).toContain("follow");
    expect(missing().robots).not.toContain("nofollow");
  });

  it("treats a deep unmatched path the same way", () => {
    expect(pageHeadMeta("/a/b/c").robots).toContain("noindex");
  });

  it("survives a path it cannot make sense of", () => {
    for (const path of ["", null, undefined, "//", "/%%%"]) {
      expect(() => pageHeadMeta(path)).not.toThrow();
    }
  });
});
