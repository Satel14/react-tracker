import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_META, canonicalFor } from "./routeMeta.js";
import { LLMS_TXT_FILE, renderLlmsTxt } from "./llmsTxt.js";

const file = renderLlmsTxt();
const lines = file.split("\n");
const linkLines = lines.filter((line) => line.startsWith("- ["));

const inSitemap = ROUTE_META.filter((route) => route.sitemap);
const excluded = ROUTE_META.filter((route) => !route.sitemap);

describe("the llms.txt document", () => {
  // The whole reason the file exists: without an H1 the format is not valid
  // Markdown for this convention, and the audit reads it as a broken file
  // rather than an absent one.
  it("opens with exactly one H1 naming the site", () => {
    const h1s = lines.filter((line) => /^# \S/.test(line));

    expect(h1s).toEqual(["# PUBG Tracker"]);
    expect(lines[0]).toBe("# PUBG Tracker");
  });

  it("says what the site is, in the summary line the format expects", () => {
    expect(file).toMatch(/^> \S.+$/m);
  });

  it("is written as Markdown, not as the HTML shell Pages serves for a missing file", () => {
    expect(file).not.toMatch(/<!DOCTYPE|<html|<script/i);
  });

  it("ends with a single trailing newline", () => {
    expect(file.endsWith("\n")).toBe(true);
    expect(file.endsWith("\n\n")).toBe(false);
  });
});

describe("the links it lists", () => {
  it("lists every page the sitemap lists, and nothing else", () => {
    const linked = linkLines.map((line) => line.match(/\((https?:[^)]+)\)/)[1]);

    expect(linked.sort()).toEqual(inSitemap.map((route) => canonicalFor(route.path)).sort());
  });

  // A route table with nine entries is not worth a file, and a file with none
  // is worse than no file at all -- it is a broken one.
  it("carries more than a couple of links", () => {
    expect(linkLines.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps the app's own screens out, the ones marked noindex", () => {
    expect(excluded.length).toBeGreaterThan(0);
    for (const route of excluded) {
      expect(file).not.toContain(canonicalFor(route.path));
    }
  });

  it("gives every link absolute URLs, since a crawler reading this has no base", () => {
    for (const line of linkLines) {
      expect(line).toMatch(/\(https:\/\/www\.pubgtracker\.top\//);
    }
  });

  it("describes each link rather than listing bare titles", () => {
    for (const route of inSitemap) {
      const line = linkLines.find((l) => l.includes(`(${canonicalFor(route.path)})`));
      expect(line, `no line for ${route.path}`).toBeTruthy();
      expect(line).toContain(route.title);
      expect(line).toContain(route.description);
    }
  });

  it("names the file where the build and _routes.json both expect it", () => {
    expect(LLMS_TXT_FILE).toBe("llms.txt");
  });
});

describe("how it is served", () => {
  // Every path hits the Pages Function unless it is excluded, and each
  // invocation is billable against the free allowance. robots.txt and
  // sitemap.xml are already excluded for that reason; this is the third static
  // file of the same kind, and the middleware has nothing to add to it.
  it("is excluded from the Pages Function, like the other static text files", () => {
    const routes = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../public/_routes.json", import.meta.url)), "utf8")
    );

    expect(routes.exclude).toContain(`/${LLMS_TXT_FILE}`);
    expect(routes.exclude).toContain("/robots.txt");
  });
});
