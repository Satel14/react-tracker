// Rewrites the built shell's <head> for one route, and puts a nav -- and for
// most routes a heading and a sentence -- inside the mount point.
//
// Pure: the prerenderHead plugin in vite.config.js does the reading and writing.
// Every substitution must match exactly once and the function throws otherwise
// -- four of the shell's meta tags carry `content=` on the line after the tag
// name, so a pattern built around a single space silently matches nothing, and
// the route would ship its own title over the homepage's description with no
// error anywhere.

// Extension spelled out, unlike the rest of src/: vite.config.js imports this
// under Node's resolver, where extensionless ESM specifiers do not resolve.
import { canonicalFor, NAV_ROUTES } from "./routeMeta.js";

const escape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// `\s+` rather than a literal space: that is what spans the newline and indent
// between the tag name and its content attribute.
const metaPattern = (attr, key) =>
  new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`, "g");

const replaceOnce = (html, pattern, replacement, what) => {
  const found = html.match(pattern);
  if (!found || found.length !== 1) {
    throw new Error(
      `renderHead: expected exactly one ${what} in the shell, found ${found ? found.length : 0}`,
    );
  }
  // A function replacement so a "$&" or "$1" in the copy stays literal.
  return html.replace(pattern, () => replacement);
};

// English, like the rest of the shell: the static HTML is what a crawler and a
// visitor see before the bundle runs, and language is chosen client-side.
const NAV_LABEL = "Site";

const required = ["path", "file", "title", "description"];

export const renderHead = (shell, route) => {
  if (!route) throw new Error("renderHead: no route meta given");
  for (const field of required) {
    if (!route[field]) throw new Error(`renderHead: route meta is missing ${field}`);
  }
  if (route.body && (!route.h1 || !route.intro)) {
    throw new Error(`renderHead: ${route.path} asks for body text but has no h1 or intro`);
  }

  const url = canonicalFor(route.path);
  const title = escape(route.title);
  const description = escape(route.description);
  const robots = escape(route.robots || "index, follow");

  const rewrites = [
    [/<title>[^<]*<\/title>/g, `<title>${title}</title>`, "<title>"],
    [
      metaPattern("name", "description"),
      `<meta name="description" content="${description}" />`,
      'meta name="description"',
    ],
    [
      metaPattern("name", "robots"),
      `<meta name="robots" content="${robots}" />`,
      'meta name="robots"',
    ],
    [
      /<link rel="canonical"[^>]*>/g,
      `<link rel="canonical" href="${url}" />`,
      'link rel="canonical"',
    ],
    [metaPattern("property", "og:url"), `<meta property="og:url" content="${url}" />`, "og:url"],
    [
      metaPattern("property", "og:title"),
      `<meta property="og:title" content="${title}" />`,
      "og:title",
    ],
    [
      metaPattern("property", "og:description"),
      `<meta property="og:description" content="${description}" />`,
      "og:description",
    ],
    [metaPattern("name", "twitter:url"), `<meta name="twitter:url" content="${url}" />`, "twitter:url"],
    [
      metaPattern("name", "twitter:title"),
      `<meta name="twitter:title" content="${title}" />`,
      "twitter:title",
    ],
    [
      metaPattern("name", "twitter:description"),
      `<meta name="twitter:description" content="${description}" />`,
      "twitter:description",
    ],
    // The shell carries one WebApplication block describing the site, and it
    // named the site root on every page -- so each route's structured data
    // contradicted its own canonical. The node still describes the app; it just
    // says so at the URL it is being served from.
    [
      /"url": "https:\/\/[^"]*"/g,
      `"url": "${url}"`,
      "structured-data url",
    ],
  ];

  let html = shell;
  for (const [pattern, replacement, what] of rewrites) {
    html = replaceOnce(html, pattern, replacement, what);
  }

  // The nav goes into every shell, the prose does not. The homepage is
  // body:false because its file is also what Pages serves for every unmatched
  // URL, and its prose would then be duplicated across an unbounded set of
  // them. A nav is site furniture -- identical on every page by design, and
  // pointing only at pages we want indexed -- so it carries none of that.
  const nav = [
    `<nav class="prerender__nav" aria-label="${escape(NAV_LABEL)}">`,
    ...NAV_ROUTES.map((item) => `<a href="${item.path}">${escape(item.nav)}</a>`),
    "</nav>",
  ].join("");

  const prose = route.body
    ? `<h1>${escape(route.h1)}</h1><p>${escape(route.intro)}</p>`
    : "";

  return replaceOnce(
    html,
    /<div id="root"><\/div>/g,
    `<div id="root"><div class="prerender">${nav}${prose}</div></div>`,
    'empty <div id="root">',
  );
};
