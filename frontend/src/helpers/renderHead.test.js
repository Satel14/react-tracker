import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderHead } from "./renderHead";
import { pageHeadMeta } from "./pageHeadMeta";
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

  // The homepage's file is also what Pages serves for every unmatched URL, so
  // whatever body it carries rides along to all of them. That is why it stayed
  // empty for a long time. What makes a body safe now is that those URLs are
  // marked noindex at the edge -- the two facts are asserted together, so
  // deleting one side cannot quietly leave the other standing alone.
  it("ships the homepage's body only because unmatched urls are noindex", () => {
    const article = '<section class="home-intro"><h1>Body</h1><p>Words.</p></section>';
    expect(renderHead(shell, route("/"), article)).toContain(article);
    expect(pageHeadMeta("/zzz-not-a-page").robots).toContain("noindex");
  });

  // Its prose comes from its own component, rendered by the build. There is no
  // hand-written stub for the homepage in routeMeta, and there must not be:
  // that copy would exist in the shell and nowhere else on the live page.
  it("writes no hand-written stub for the homepage", () => {
    const html = renderHead(shell, route("/"));
    const body = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
    expect(body).not.toContain("<h1>");
    expect(body).not.toContain("<p>");
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

// Nothing in the raw HTML links anywhere. The navbar's anchors are rendered by
// React, so a crawler that does not run JS -- GPTBot, ClaudeBot, PerplexityBot,
// and anything reading the shell directly -- can only find pages through the
// sitemap. These put the same four indexable routes into every shell.
describe("crawlable navigation", () => {
  const navOf = (html) => {
    const block = /<nav[^>]*>([\s\S]*?)<\/nav>/.exec(html);
    if (!block) return null;
    return [...block[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  };

  it.each(ROUTE_META.map((r) => r.path))("puts the nav into %s", (path) => {
    const html = renderHead(shell, ROUTE_META.find((r) => r.path === path));
    expect(navOf(html)).toEqual(["/", "/leaderboards", "/ranks", "/help"]);
  });

  // A nav is site furniture rather than content, so it goes into every shell,
  // including the homepage's -- which is also the file every unmatched URL
  // gets, and the only crawlable link list this site has without JavaScript.
  it("gives the homepage the nav", () => {
    const html = renderHead(shell, ROUTE_META.find((r) => r.path === "/"));
    expect(navOf(html)).toHaveLength(4);
  });

  it("carries a real label on every link, not a bare path", () => {
    const html = renderHead(shell, ROUTE_META.find((r) => r.path === "/help"));
    const block = /<nav[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1];
    for (const text of [...block.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1])) {
      expect(text.trim().length).toBeGreaterThan(3);
      expect(text).not.toMatch(/^\//);
    }
  });

  it("names the nav for a screen reader", () => {
    expect(renderHead(shell, ROUTE_META.find((r) => r.path === "/ranks")))
      .toMatch(/<nav[^>]+aria-label="[^"]+"/);
  });

  it("links only to routes it is willing to have indexed", () => {
    const html = renderHead(shell, ROUTE_META.find((r) => r.path === "/ranks"));
    for (const href of navOf(html)) {
      const route = ROUTE_META.find((r) => r.path === href);
      expect(route, `${href} is not a known route`).toBeTruthy();
      expect(route.robots || "", href).not.toContain("noindex");
      expect(route.sitemap, `${href} should be in the sitemap`).toBe(true);
    }
  });
});

// One WebApplication block ships in the shell. It named the site root on every
// page, so each route's structured data disagreed with its own canonical.
describe("structured data", () => {
  const ldUrl = (html) =>
    /"@type": "WebApplication"[\s\S]*?"url": "([^"]+)"/.exec(html)?.[1]
      ?? /"url": "([^"]+)"/.exec(html)?.[1];

  it.each(["/", "/ranks", "/help"])("points at %s, not the site root", (path) => {
    const meta = ROUTE_META.find((r) => r.path === path);
    expect(ldUrl(renderHead(shell, meta))).toBe(canonicalFor(path));
  });

  it("agrees with the canonical it ships beside", () => {
    const html = renderHead(shell, route("/leaderboards"));
    const canonical = /rel="canonical" href="([^"]+)"/.exec(html)[1];
    expect(ldUrl(html)).toBe(canonical);
  });
});

describe("a route that ships its whole article", () => {
  const ARTICLE = '<div class="content ranks-page"><h1>Ranks</h1><p>Eight tiers.</p></div>';
  const ranks = () => renderHead(shell, route("/ranks"), ARTICLE);

  it("puts the rendered article into the mount point", () => {
    expect(ranks()).toContain(ARTICLE);
  });

  // The stub is a heading and a sentence written into routeMeta by hand. Once
  // the real page is rendered, keeping it would print the h1 twice.
  it("drops the hand-written stub in favour of it", () => {
    const html = ranks();
    expect(html).not.toContain(`<h1>${route("/ranks").h1}</h1><p>`);
    expect((html.match(/<h1>/g) || []).length).toBe(1);
  });

  // .prerender is a 40rem centred column with 96px of padding, sized for two
  // lines of text. An article inside it would render down a narrow strip.
  it("does not wrap it in the centred stub layout", () => {
    expect(ranks()).not.toContain('<div class="prerender">');
  });

  it("still puts the nav above it", () => {
    const html = ranks();
    expect(html).toContain('class="prerender__nav"');
    expect(html.indexOf("prerender__nav")).toBeLessThan(html.indexOf(ARTICLE));
  });

  it("still rewrites the head for the route", () => {
    const html = ranks();
    expect(html).toContain(`<link rel="canonical" href="${canonicalFor("/ranks")}" />`);
    expect(/<title>([^<]*)<\/title>/.exec(html)[1]).toBe(route("/ranks").title);
  });

  // The article is markup we generated from our own components, not copy from
  // routeMeta -- escaping it would ship the tags as visible text.
  it("does not escape the markup it was handed", () => {
    expect(ranks()).not.toContain("&lt;div");
  });

  it("leaves a route without one exactly as it was", () => {
    expect(help()).toContain('<div class="prerender">');
    expect(help()).toContain(`<h1>${route("/help").h1}</h1>`);
  });
});
