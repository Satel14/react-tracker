import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const build = (file) => fileURLToPath(new URL(`./build/${file}`, import.meta.url));

// Reads the build output, so it only means anything after `npm run build`.
// Skipped rather than failed when there is no build, because a unit-test run on
// a clean checkout is not a regression.
const ROUTES = ["index.html", "stats-by-rank.html", "ranks.html", "ua/ranks.html"];

describe("critical CSS", () => {
  const present = ROUTES.filter((r) => existsSync(build(r)));
  const maybe = present.length === ROUTES.length ? it.each(ROUTES) : it.skip.each(ROUTES);

  maybe("inlines what %s needs before first paint", (route) => {
    const html = readFileSync(build(route), "utf8");
    const inlined = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("");

    expect(inlined.length, "nothing was inlined").toBeGreaterThan(500);

    // Without :root and the tokens every var() resolves to nothing and the text
    // is invisible on this dark theme -- a failure no rendering test can see.
    expect(inlined).toContain(":root");
    expect(inlined).toMatch(/--text\b/);
    expect(inlined).toMatch(/--bg\b/);

    // The font stack is inlined by the extractor; the @font-face rules it names
    // are NOT, unless forced. Missing them silently restores the swap reflow.
    //
    // Matched loosely rather than as a literal substring: Vite's CSS minifier
    // (unrelated to beasties -- the same escaping is already in the built
    // asset before beasties ever sees it) drops the quotes around this
    // family name and escapes its colon, so "Inter Fallback: Arial" ships as
    // `Inter Fallback\: Arial`. Either spelling is equally good evidence the
    // rule is present.
    for (const suffix of ["-apple-system", "Segoe UI", "Roboto", "Arial"]) {
      const pattern = new RegExp(`Inter Fallback\\\\?:\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      expect(inlined, `@font-face for Inter Fallback: ${suffix} was not inlined`).toMatch(pattern);
    }
    expect((inlined.match(/@font-face/g) ?? []).length).toBeGreaterThanOrEqual(4);

    // And the full stylesheet must no longer block: it is preloaded and
    // promoted on load, which is the whole point of the exercise.
    //
    // Attributes are matched independently of order rather than as one fixed
    // sequence: beasties emits `rel="preload" crossorigin href="...index-*.css"
    // onload="..." as="style"` -- href (carrying "index-") lands before
    // as="style", not after.
    const preloadLink = [...html.matchAll(/<link[^>]*>/g)]
      .map((m) => m[0])
      .find((tag) => tag.includes('rel="preload"') && tag.includes('as="style"') && tag.includes("index-"));
    expect(preloadLink, "no preloaded+promoted stylesheet link was found").toBeTruthy();
  });
});
