import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderHead } from "./renderHead";
import { ROUTE_META, canonicalFor } from "./routeMeta";

const shell = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8",
);

const route = (path) => ROUTE_META.find((r) => r.path === path);
const help = () => renderHead(shell, route("/help"));

const contentOf = (html, key) => {
  const re = new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`, "i");
  const match = re.exec(html);
  return match ? match[1] : undefined;
};

describe("head rewriting", () => {
  it("gives the route its own title", () => {
    expect(/<title>([^<]*)<\/title>/.exec(help())[1]).toBe(route("/help").title);
  });

  it("points the canonical at the route itself", () => {
    expect(help()).toContain(`<link rel="canonical" href="${canonicalFor("/help")}" />`);
  });

  it("leaves exactly one canonical behind", () => {
    // Two rel=canonical tags on one page is the documented way to have Google
    // ignore both, and it is what bolting a second mechanism on top produces.
    expect(help().match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps the social urls in step with the canonical", () => {
    const html = help();
    expect(contentOf(html, "og:url")).toBe(canonicalFor("/help"));
    expect(contentOf(html, "twitter:url")).toBe(canonicalFor("/help"));
  });

  it("carries the route's copy into the social tags", () => {
    const html = help();
    expect(contentOf(html, "og:title")).toBe(route("/help").title);
    expect(contentOf(html, "og:description")).toBe(route("/help").description);
    expect(contentOf(html, "twitter:title")).toBe(route("/help").title);
    expect(contentOf(html, "twitter:description")).toBe(route("/help").description);
  });

  // The shell writes content= on the line after the tag name for description,
  // keywords, og:description and twitter:description. A pattern built around a
  // single space matches none of them and reports nothing, so every route would
  // ship its own title over the homepage's description.
  it("rewrites a meta tag whose content sits on the next line", () => {
    expect(shell).toMatch(/<meta name="description"\s*\r?\n\s+content=/);
    expect(contentOf(help(), "description")).toBe(route("/help").description);
  });

  it("applies the route's robots directive", () => {
    expect(contentOf(renderHead(shell, route("/favorites")), "robots")).toContain("noindex");
    expect(contentOf(help(), "robots")).toBe("index, follow");
  });
});

describe("body text", () => {
  it("puts the heading and intro inside the mount point", () => {
    const html = help();
    expect(html).toContain(`<h1>${route("/help").h1}</h1>`);
    expect(html).toContain(route("/help").intro);
    expect(/<div id="root">(.+)<\/div>/s.exec(html)[1]).toContain("<h1>");
  });

  it("leaves the mount point empty for a route that asks for no body", () => {
    expect(renderHead(shell, route("/"))).toContain('<div id="root"></div>');
  });
});

describe("refusing to fail quietly", () => {
  it("throws when a tag it is meant to rewrite is missing", () => {
    const withoutCanonical = shell.replace(/\s*<link rel="canonical"[^>]*>/, "");
    expect(() => renderHead(withoutCanonical, route("/help"))).toThrow(/canonical/i);
  });

  it("throws when a tag it is meant to rewrite appears twice", () => {
    const doubled = shell.replace("<title>", "<title>x</title>\n  <title>");
    expect(() => renderHead(doubled, route("/help"))).toThrow(/title/i);
  });

  it("throws rather than emit a route it has no copy for", () => {
    expect(() => renderHead(shell, undefined)).toThrow();
    expect(() => renderHead(shell, { path: "/x", file: "x.html" })).toThrow();
  });
});

describe("escaping", () => {
  it("escapes a quote and an ampersand in the copy", () => {
    const html = renderHead(shell, {
      ...route("/help"),
      title: 'K/D & "form"',
      description: 'Damage & rank, "season" to season, for every player you follow on this device.',
    });
    expect(contentOf(html, "og:title")).toBe("K/D &amp; &quot;form&quot;");
    expect(html).toContain("<title>K/D &amp; &quot;form&quot;</title>");
  });
});

// seoMeta.test.js reads the source index.html, so it cannot see a head this
// transform has mangled. These are the same invariants, re-checked on the output
// that actually ships.
describe("what the share-card guard pins, re-checked on the output", () => {
  const rendered = () => ROUTE_META.map((r) => ({ path: r.path, html: renderHead(shell, r) }));

  it("keeps og:image and twitter:image absolute and png on every route", () => {
    for (const { path, html } of rendered()) {
      for (const key of ["og:image", "twitter:image"]) {
        expect(contentOf(html, key), `${path} ${key}`).toMatch(/^https:\/\/.*\.png$/);
      }
    }
  });

  it("keeps the card dimensions on every route", () => {
    for (const { path, html } of rendered()) {
      expect(contentOf(html, "og:image:width"), `${path}`).toBe("1200");
      expect(contentOf(html, "og:image:height"), `${path}`).toBe("630");
    }
  });

  it("keeps every twitter tag on name= on every route", () => {
    for (const { path, html } of rendered()) {
      const wrong = [...html.matchAll(/<meta\s+property="(twitter:[^"]+)"/g)].map((m) => m[1]);
      expect(wrong, `${path}`).toEqual([]);
    }
  });
});
