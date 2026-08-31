// Writes one static shell per fixed route into the build output, so a crawler
// asking for /leaderboards gets that route's title, description and canonical
// instead of the homepage's.
//
// Runs after `vite build` -- see the build script in package.json. Cloudflare
// Pages serves a flat build/leaderboards.html at /leaderboards with a 200, ahead
// of its single-page-app fallback to build/index.html, which is still what every
// dynamic route gets.
//
// The Cloudflare build command has to be `npm run build` for any of this to
// reach production; it lives in the dashboard, not in this repo. That is why
// index.html keeps the homepage's own canonical instead of leaving it to this
// script: if the script never runs, the site is exactly as it was.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROUTE_META, canonicalFor } from "../src/helpers/routeMeta.js";
import { renderHead } from "../src/helpers/renderHead.js";

const buildDir = new URL("../build/", import.meta.url);
const shellPath = fileURLToPath(new URL("index.html", buildDir));

if (!existsSync(shellPath)) {
  throw new Error(`prerender-head: ${shellPath} is missing -- run vite build first`);
}

// Read once, before writing anything. build/index.html is itself one of the
// outputs, so re-reading it per route would feed the homepage's substitutions
// into the next route's shell.
const shell = readFileSync(shellPath, "utf8");

const written = ROUTE_META.map((route) => {
  if (route.file === "404.html") {
    // Pages reads a top-level 404.html as "this is not a single-page app" and
    // stops falling back to the shell, which 404s every deep link on the site.
    throw new Error("prerender-head: refusing to write a top-level 404.html");
  }
  return { route, html: renderHead(shell, route) };
});

for (const { route, html } of written) {
  writeFileSync(fileURLToPath(new URL(route.file, buildDir)), html);
}

// Check the output rather than trusting it: a wrong canonical is invisible until
// Google has already read it.
for (const { route } of written) {
  const target = fileURLToPath(new URL(route.file, buildDir));
  if (!existsSync(target)) {
    throw new Error(`prerender-head: ${route.file} was not written`);
  }
  const emitted = readFileSync(target, "utf8");
  const canonical = `<link rel="canonical" href="${canonicalFor(route.path)}" />`;
  if (!emitted.includes(canonical)) {
    throw new Error(`prerender-head: ${route.file} is missing ${canonical}`);
  }
  if ((emitted.match(/rel="canonical"/g) || []).length !== 1) {
    throw new Error(`prerender-head: ${route.file} does not have exactly one canonical`);
  }
}

console.log(
  `prerender-head: wrote ${written.length} shells (${written.map(({ route }) => route.file).join(", ")})`,
);
