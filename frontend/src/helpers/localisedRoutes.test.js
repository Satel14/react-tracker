import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderHead } from "./renderHead";
import {
  ROUTE_META,
  canonicalFor,
  alternatesFor,
  translationFor,
  languageForPath,
} from "./routeMeta";

const shell = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8",
);

const route = (path) => ROUTE_META.find((r) => r.path === path);

const alternateLinks = (html) =>
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map((m) => ({
    hreflang: m[1],
    href: m[2],
  }));

describe("the Ukrainian twin of /ranks", () => {
  it("is a route of its own, submitted like any other", () => {
    const ua = route("/ua/ranks");
    expect(ua).toBeTruthy();
    expect(ua.sitemap).toBe(true);
    expect(ua.robots).toBeUndefined();
  });

  it("is rendered from the ua dictionary", () => {
    expect(route("/ua/ranks").translations).toBe("ua");
  });

  // The path segment is /ua/ because that is the form people recognise. The
  // language code is uk: that is the ISO code, and hreflang accepts no other
  // spelling for Ukrainian.
  it("declares the language code Google reads, not the one in the path", () => {
    expect(route("/ua/ranks").lang).toBe("uk");
  });

  it("carries head copy of its own rather than the English page's", () => {
    const ua = route("/ua/ranks");
    expect(ua.title).not.toBe(route("/ranks").title);
    expect(ua.title).toMatch(/[а-яіїєґ]/i);
    expect(ua.description).toMatch(/[а-яіїєґ]/i);
  });
});

describe("pairing the two languages", () => {
  const expected = () => [
    { hreflang: "en", href: canonicalFor("/ranks") },
    { hreflang: "uk", href: canonicalFor("/ua/ranks") },
    { hreflang: "x-default", href: canonicalFor("/ranks") },
  ];

  // Google reads the set as a claim about a group of pages, and drops the whole
  // group unless every page in it names every other. A one-way link is the
  // documented way to have the pair ignored.
  it("names both pages from both pages", () => {
    expect(alternatesFor("/ranks")).toEqual(expected());
    expect(alternatesFor("/ua/ranks")).toEqual(expected());
  });

  it("leaves a page that exists in one language alone", () => {
    expect(alternatesFor("/help")).toEqual([]);
    expect(alternatesFor("/")).toEqual([]);
  });
});

describe("walking between the languages", () => {
  it("sends each ranks page at the other", () => {
    expect(translationFor("/ranks", "ua")).toBe("/ua/ranks");
    expect(translationFor("/ua/ranks", "en")).toBe("/ranks");
  });

  it("has nowhere to send a page with no twin", () => {
    expect(translationFor("/help", "ua")).toBe(null);
    expect(translationFor("/nope", "ua")).toBe(null);
  });

  it("stays where it is when asked for the language it already shows", () => {
    expect(translationFor("/ranks", "en")).toBe(null);
  });

  // Both halves of a pair commit to a language, not just the prefixed one:
  // /ranks is the English page, not the page with no opinion. Reading it as
  // "no opinion" is what served Ukrainian to a reader who had just clicked
  // "Read in English", because their stored choice then won.
  it("reads the language each half of a pair commits to", () => {
    expect(languageForPath("/ua/ranks")).toBe("ua");
    expect(languageForPath("/ranks")).toBe("en");
  });

  it("leaves the choice to the visitor on a page that has no twin", () => {
    expect(languageForPath("/help")).toBe(null);
    expect(languageForPath("/nope")).toBe(null);
  });
});

describe("the head of a localised page", () => {
  const ukrainian = () => renderHead(shell, route("/ua/ranks"));
  const english = () => renderHead(shell, route("/ranks"));

  it("changes the document language", () => {
    expect(ukrainian()).toContain('<html lang="uk">');
    expect(english()).toContain('<html lang="en">');
  });

  it("declares the pair on both pages", () => {
    expect(alternateLinks(ukrainian())).toEqual(alternatesFor("/ua/ranks"));
    expect(alternateLinks(english())).toEqual(alternatesFor("/ranks"));
  });

  it("still points its canonical at itself, and only once", () => {
    const html = ukrainian();
    expect(html).toContain(`<link rel="canonical" href="${canonicalFor("/ua/ranks")}" />`);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps the social urls on the page they belong to", () => {
    expect(ukrainian()).toContain(
      `<meta property="og:url" content="${canonicalFor("/ua/ranks")}" />`,
    );
  });

  it("puts no alternates on a page that has no twin", () => {
    expect(alternateLinks(renderHead(shell, route("/help")))).toEqual([]);
  });
});
