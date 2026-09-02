// Gives every URL that is not a file the build wrote a head of its own.
//
// The fixed routes get theirs at build time (see the prerenderHead plugin in
// vite.config.js), but /player/:platform/:gameId, /match/... and /overlay/...
// cannot: there is one URL per player and per match. Cloudflare Pages serves
// build/index.html for all of them, so without this every player page ships the
// homepage's title, description and canonical -- which is what kept them out of
// the index in the first place.
//
// The same fallback answers every unmatched path, so a typo used to declare
// "index, follow" and a canonical pointing at the homepage. Harmless while the
// homepage file held no prose; not harmless once it carries a body, because
// the body rides along to all of them. pageHeadMeta marks those noindex.
//
// _routes.json therefore includes every path and excludes the built assets:
// without that exclusion each of the ~19 hashed files a page load pulls would
// be a billable Function invocation against the 100k/day free allowance.
//
// It reads the URL and nothing else. Calling the PUBG API from here would put
// Googlebot on a ten-requests-a-minute budget shared with the live site.

import { pageHeadMeta } from "../src/helpers/pageHeadMeta.js";

const META_BY_KEY = {
  description: ["name", "description"],
  robots: ["name", "robots"],
  "og:title": ["property", "og:title"],
  "og:description": ["property", "og:description"],
  "og:url": ["property", "og:url"],
  "twitter:title": ["name", "twitter:title"],
  "twitter:description": ["name", "twitter:description"],
  "twitter:url": ["name", "twitter:url"],
};

// HTMLRewriter escapes what it writes: lol-html escapes double quotes in an
// attribute value, and setInnerContent with the default html:false escapes
// & < > in text. So the values go in raw -- pre-escaping here would double up
// and ship a literal &amp; in the title.
const setContent = (rewriter, kind, key, value) =>
  rewriter.on(`meta[${kind}="${key}"]`, {
    element(element) {
      element.setAttribute("content", value);
    },
  });

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const meta = pageHeadMeta(url.pathname);

  // A fixed route: the build already wrote and verified that file's head, so
  // hand it straight back untouched.
  if (!meta) return context.next();

  // A revalidation would 304 with no body to rewrite, and the browser would
  // keep whatever head it cached before this Function existed -- on that URL,
  // forever. Ask for the whole document instead.
  const request = new Request(context.request);
  request.headers.delete("If-None-Match");
  request.headers.delete("If-Modified-Since");

  const response = await context.next(request);

  // Only a real HTML document is ours to touch. An asset that slipped past
  // _routes.json, a redirect, an error: all pass through unread.
  const type = response.headers.get("content-type") || "";
  if (response.status !== 200 || !type.includes("text/html")) return response;

  let rewriter = new HTMLRewriter().on("title", {
    element(element) {
      element.setInnerContent(meta.title);
    },
  });

  for (const [key, value] of Object.entries({
    description: meta.description,
    robots: meta.robots,
    "og:title": meta.title,
    "og:description": meta.description,
    "twitter:title": meta.title,
    "twitter:description": meta.description,
    ...(meta.canonical ? { "og:url": meta.canonical, "twitter:url": meta.canonical } : {}),
  })) {
    const [kind, name] = META_BY_KEY[key];
    rewriter = setContent(rewriter, kind, name, value);
  }

  rewriter = rewriter.on('link[rel="canonical"]', {
    element(element) {
      if (meta.canonical) {
        element.setAttribute("href", meta.canonical);
        return;
      }
      // No canonical of its own -- a URL the router will not match. Leaving the
      // homepage's in place would tell Google this is the homepage; removing it
      // lets the noindex above speak for itself.
      element.remove();
    },
  });

  return rewriter.transform(response);
};
