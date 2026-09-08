import { renderSitemap, lastmodFor, CENSUS_PAGES } from "./sitemap";
import { ROUTE_META, canonicalFor } from "./routeMeta";
import { CENSUS_SNAPSHOT } from "./censusSnapshot";

const xml = () => renderSitemap();
const locsIn = (text) => [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const entriesIn = (text) => [...text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);

describe("what the sitemap lists", () => {
  // Written out rather than derived. Deriving it from ROUTE_META -- which is
  // what the generator does -- makes the assertion move with the code: flipping
  // a route's `sitemap` flag would change both sides and pass. This list is the
  // independent statement of what we submit, so changing that set has to be
  // deliberate enough to edit a test.
  it("is exactly these five URLs", () => {
    expect(locsIn(xml())).toEqual([
      "https://www.pubgtracker.top/",
      "https://www.pubgtracker.top/leaderboards",
      "https://www.pubgtracker.top/help",
      "https://www.pubgtracker.top/ranks",
      "https://www.pubgtracker.top/ua/ranks",
    ]);
  });

  it("submits exactly the routes marked for it, and in the table's order", () => {
    const wanted = ROUTE_META.filter((route) => route.sitemap).map((route) => canonicalFor(route.path));
    expect(wanted.length).toBeGreaterThan(3);
    expect(locsIn(xml())).toEqual(wanted);
  });

  it("names each page by its own canonical", () => {
    // A loc that disagreed with the page's own canonical would make the entry
    // either a redirect or a competing claim about the same content. The
    // homepage is the one URL whose canonical ends in a slash; every other
    // route is served flat, and /help/ answers 308.
    for (const loc of locsIn(xml())) {
      expect(loc).toMatch(/^https:\/\/www\.pubgtracker\.top\//);
      if (loc !== "https://www.pubgtracker.top/") expect(loc).not.toMatch(/\/$/);
    }
    expect(locsIn(xml())).toContain("https://www.pubgtracker.top/");
  });

  it("submits nothing it tells Google not to index", () => {
    const noindexed = ROUTE_META.filter((route) => (route.robots || "").includes("noindex"));
    expect(noindexed.length).toBeGreaterThan(0);
    for (const route of noindexed) {
      expect(xml(), route.path).not.toContain(canonicalFor(route.path));
    }
  });
});

describe("lastmod", () => {
  // The two census pages change when the census does, and the snapshot records
  // when that was. Nothing else on the site can name the moment its own content
  // changed from inside a build, and lastmod is per-URL and optional -- so the
  // rest carry none. Google drops a lastmod it decides is unreliable, and one
  // invented date is enough to earn that for the whole file.
  it("dates the pages whose content the census moves", () => {
    expect(CENSUS_PAGES).toEqual(["/ranks", "/ua/ranks"]);
    for (const path of CENSUS_PAGES) {
      expect(lastmodFor(path)).toBe(CENSUS_SNAPSHOT.capturedAt);
    }
  });

  it("invents no date for the pages it cannot date", () => {
    for (const path of ["/", "/help", "/leaderboards"]) {
      expect(lastmodFor(path), path).toBeNull();
    }
    const undated = entriesIn(xml()).filter((entry) => !entry.includes("<lastmod>"));
    expect(undated).toHaveLength(3);
  });

  it("writes a date Google will parse", () => {
    const dates = [...xml().matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(dates).toHaveLength(CENSUS_PAGES.length);
    for (const date of dates) {
      // W3C datetime, which is what the sitemap protocol asks for.
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(Number.isNaN(Date.parse(date))).toBe(false);
    }
  });

  it("says nothing rather than something wrong when there is no snapshot", () => {
    const withoutSnapshot = renderSitemap({ snapshot: null });
    expect(withoutSnapshot).not.toContain("<lastmod>");
    expect(locsIn(withoutSnapshot)).toEqual(locsIn(xml()));
  });
});

describe("what the sitemap no longer says", () => {
  // Google documents ignoring both, and they had gone from merely useless to
  // wrong: /ranks was declared "monthly" and the census now rewrites it daily.
  it("drops changefreq and priority", () => {
    expect(xml()).not.toContain("changefreq");
    expect(xml()).not.toContain("priority");
  });
});

describe("the file itself", () => {
  it("is a well-formed urlset", () => {
    const text = xml();
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect((text.match(/<urlset/g) || []).length).toBe(1);
    expect((text.match(/<\/urlset>/g) || []).length).toBe(1);
    expect(text).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(entriesIn(text)).toHaveLength(locsIn(text).length);
    expect(text.endsWith("</urlset>\n")).toBe(true);
  });

  it("needs no escaping, and would be wrong if it did", () => {
    // Every path here is ASCII and slash-separated. An & or a < in a loc would
    // have to be escaped, so this fails rather than shipping invalid XML.
    for (const loc of locsIn(xml())) expect(loc).toMatch(/^[A-Za-z0-9:/._-]+$/);
  });
});
