// The sitemap, generated from the route table rather than kept beside it.
//
// It used to be a hand-written frontend/public/sitemap.xml, and the cost of
// that was not the duplication -- routeMeta.test.js pinned the two together --
// but that a static file cannot carry a date. <lastmod> is the one field in
// this format Google acts on, and it only became worth having once Google was
// actually fetching these URLs: before that it was a recrawl hint for pages
// that had never been crawled once.
//
// changefreq and priority are gone. Google documents ignoring both, and here
// they had gone from useless to wrong: /ranks was declared "monthly" and the
// census rewrites it every day.
//
// Extensions spelled out: vite.config.js imports this under Node's resolver.

import { ROUTE_META, canonicalFor } from "./routeMeta.js";
import { CENSUS_SNAPSHOT } from "./censusSnapshot.js";

// The pages whose text the census moves. Their <lastmod> is the moment the
// reading behind them was taken, which is the moment their content changed --
// and since the daily job commits that reading, the date maintains itself.
export const CENSUS_PAGES = ["/ranks", "/ua/ranks", "/rank-points", "/ua/rank-points"];

// A date for a page we can date, and null for one we cannot.
//
// Every other route changes when someone deploys, and a build cannot name that
// moment: the build time is when the file was made, not when its words last
// changed, and a sitemap that redates five URLs on every deploy is telling
// Google five things that are not true. lastmod is per-URL and optional, so
// those simply carry none -- Google discards a lastmod it decides is
// unreliable, and one invented date is enough to earn that for the whole file.
export const lastmodFor = (path, snapshot = CENSUS_SNAPSHOT) =>
  (CENSUS_PAGES.includes(path) && snapshot?.capturedAt) || null;

export const renderSitemap = ({ snapshot = CENSUS_SNAPSHOT } = {}) => {
  const entries = ROUTE_META.filter((route) => route.sitemap).map((route) => {
    const lastmod = lastmodFor(route.path, snapshot);
    return [
      "  <url>",
      `    <loc>${canonicalFor(route.path)}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      "  </url>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
};

export const SITEMAP_FILE = "sitemap.xml";
