import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROUTE_META, SITE_ORIGIN, canonicalFor } from "./routeMeta";

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

// Read the router as text rather than importing it: routes.js pulls in page
// components, and this spec runs in the logic project, which has no DOM. The
// navigationTargets guard reads its sources the same way.
const routerPaths = () =>
  [...read("../router/routes.js").matchAll(/\bpath:\s*"([^"]+)"/g)].map((m) => m[1]);

const fixedPaths = () => routerPaths().filter((p) => !p.includes(":"));

describe("route coverage", () => {
  it("finds the routes it is meant to be covering", () => {
    // A regex that silently matched nothing would make every assertion below
    // vacuous.
    expect(fixedPaths().length).toBeGreaterThan(5);
  });

  it("covers every parameterless route except /404", () => {
    const covered = new Set(ROUTE_META.map((r) => r.path));
    const missing = fixedPaths().filter((p) => p !== "/404" && !covered.has(p));
    expect(missing).toEqual([]);
  });

  it("describes no route the router does not have", () => {
    const known = new Set(routerPaths());
    expect(ROUTE_META.filter((r) => !known.has(r.path)).map((r) => r.path)).toEqual([]);
  });
});

describe("emitted filenames", () => {
  // Cloudflare Pages treats a top-level 404.html as "this project is not a SPA"
  // and stops mapping unmatched paths to the shell. /404 is a declared route, so
  // a naive loop over the router emits exactly that filename and every
  // /player/... deep link starts 404ing.
  it("never emits a top-level 404.html", () => {
    expect(ROUTE_META.map((r) => r.file)).not.toContain("404.html");
    expect(ROUTE_META.some((r) => r.path === "/404")).toBe(false);
  });

  // build/help.html answers /help with a 200. build/help/index.html would 308 to
  // /help/, which makes the self-referencing canonical point at a redirect.
  //
  // A file inside a directory is not the same thing and is fine:
  // build/ua/ranks.html answers /ua/ranks with a 200 exactly as the flat files
  // do. What must never appear is that directory's index.
  it("is never a directory index", () => {
    const indexes = ROUTE_META.filter(
      (r) => r.path !== "/" && r.file.endsWith("/index.html"),
    );
    expect(indexes.map((r) => r.file)).toEqual([]);
  });

  it("names each file after its route", () => {
    for (const { path, file } of ROUTE_META) {
      expect(file).toBe(path === "/" ? "index.html" : `${path.slice(1)}.html`);
    }
  });

  it("gives the homepage the file Pages also uses as its fallback", () => {
    expect(ROUTE_META.find((r) => r.path === "/").file).toBe("index.html");
  });
});

describe("canonical urls", () => {
  it("is absolute and www-hosted, so an apex hit still consolidates", () => {
    // A root-relative href on a <link> is resolved as a build asset by Vite and
    // fails the build outright, and a relative canonical would also stop
    // consolidating apex -> www while both hosts answer 200.
    for (const { path } of ROUTE_META) {
      expect(canonicalFor(path)).toBe(path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`);
    }
    expect(SITE_ORIGIN).toBe("https://www.pubgtracker.top");
  });

  it("carries no trailing slash except on the homepage", () => {
    const slashed = ROUTE_META.filter((r) => r.path !== "/" && canonicalFor(r.path).endsWith("/"));
    expect(slashed.map((r) => r.path)).toEqual([]);
  });
});

describe("copy", () => {
  it("gives every route its own title and description", () => {
    const titles = ROUTE_META.map((r) => r.title);
    const descriptions = ROUTE_META.map((r) => r.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("stays inside what a search result will show", () => {
    for (const { path, title, description } of ROUTE_META) {
      expect(title.length, `${path} title`).toBeLessThanOrEqual(60);
      expect(description.length, `${path} description`).toBeLessThanOrEqual(155);
      expect(title.length, `${path} title`).toBeGreaterThan(9);
      expect(description.length, `${path} description`).toBeGreaterThan(49);
    }
  });

  it("gives every route that renders body text an h1 and an intro", () => {
    for (const route of ROUTE_META.filter((r) => r.body)) {
      expect(route.h1.length, `${route.path} h1`).toBeGreaterThan(9);
      expect(route.intro.length, `${route.path} intro`).toBeGreaterThan(29);
    }
  });

  // The homepage does have a body now -- but it comes from its own component,
  // rendered by the build (see prerenderBody), not from a stub written here.
  // A stub would be copy that exists in the static file and nowhere on the
  // live page, which is the drift the rendered body exists to prevent.
  it("writes no hand-written stub for the homepage", () => {
    expect(ROUTE_META.find((r) => r.path === "/").body).toBe(false);
  });
});

describe("robots and sitemap agree", () => {
  const sitemap = read("../../public/sitemap.xml");
  const listed = (path) =>
    sitemap.includes(`<loc>${canonicalFor(path)}</loc>`);

  it("submits exactly the routes marked for the sitemap", () => {
    for (const { path, sitemap: wanted } of ROUTE_META) {
      expect(listed(path), `${path} in sitemap.xml`).toBe(Boolean(wanted));
    }
  });

  it("never submits a route it tells Google not to index", () => {
    const contradictory = ROUTE_META.filter(
      (r) => r.sitemap && (r.robots || "").includes("noindex")
    );
    expect(contradictory.map((r) => r.path)).toEqual([]);
  });

  it("keeps a page that is empty for every crawler out of the index", () => {
    // /favorites is a localStorage list and /compare is driven by query params;
    // both render an empty state for anyone who is not the visitor who filled
    // them, which is exactly what thin content means.
    for (const path of ["/favorites", "/compare", "/bugreport", "/player"]) {
      const route = ROUTE_META.find((r) => r.path === path);
      expect(route.robots, `${path} robots`).toContain("noindex");
      expect(route.sitemap, `${path} sitemap`).toBeFalsy();
    }
  });
});
