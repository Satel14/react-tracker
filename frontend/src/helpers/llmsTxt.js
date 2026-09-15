// The llms.txt index, generated from the route table for the same reason the
// sitemap is: a hand-written copy goes stale the day a page is added, and
// nothing fails when it does.
//
// Before this there was no file at all. That was not obvious from the outside --
// Cloudflare Pages answers an unknown path with the SPA shell and a 200, so a
// fetch of /llms.txt returned HTML, and anything expecting Markdown read it as a
// broken file rather than a missing one.
//
// Same routes as the sitemap, by the same `sitemap` flag: those are the pages
// that carry text worth reading. The app's own screens -- favorites, compare,
// the player search, the bug report -- are marked noindex and are of no use to
// something that cannot click.
//
// Extensions spelled out: vite.config.js imports this under Node's resolver.

import { ROUTE_META, canonicalFor, routeMetaFor } from "./routeMeta.js";

export const LLMS_TXT_FILE = "llms.txt";

const linkLine = (route) => `- [${route.title}](${canonicalFor(route.path)}): ${route.description}`;

const isUkrainian = (route) => route.path.startsWith("/ua/");

export const renderLlmsTxt = () => {
  const listed = ROUTE_META.filter((route) => route.sitemap);
  const english = listed.filter((route) => !isUkrainian(route));
  const ukrainian = listed.filter(isUkrainian);

  // The homepage's own description rather than a second one written here, which
  // would be one more sentence to keep in step with the rest of the site.
  const summary = routeMetaFor("/")?.description || "";

  return [
    "# PUBG Tracker",
    "",
    `> ${summary}`,
    "",
    "## Pages",
    "",
    ...english.map(linkLine),
    ...(ukrainian.length
      ? ["", "## Ukrainian pages", "", ...ukrainian.map(linkLine)]
      : []),
    "",
  ].join("\n");
};
