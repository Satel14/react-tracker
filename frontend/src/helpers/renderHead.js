// Rewrites the built shell's <head> for one route, and optionally puts a
// heading and a sentence inside the mount point.
//
// Pure: `scripts/prerender-head.mjs` does the reading and writing. Every
// substitution must match exactly once and the function throws otherwise --
// four of the shell's meta tags carry `content=` on the line after the tag name,
// so a pattern built around a single space silently matches nothing, and the
// route would ship its own title over the homepage's description with no error
// anywhere.

// Extension spelled out, unlike the rest of src/: the build script imports
// this under plain Node, where extensionless ESM specifiers do not resolve.
import { canonicalFor } from "./routeMeta.js";

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
  ];

  let html = shell;
  for (const [pattern, replacement, what] of rewrites) {
    html = replaceOnce(html, pattern, replacement, what);
  }

  if (route.body) {
    html = replaceOnce(
      html,
      /<div id="root"><\/div>/g,
      `<div id="root"><div class="prerender"><h1>${escape(route.h1)}</h1><p>${escape(route.intro)}</p></div></div>`,
      'empty <div id="root">',
    );
  }

  return html;
};
