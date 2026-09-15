import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// index.html is not built from anything -- it is hand-edited and shipped almost
// as written, so the only thing standing between it and a regression is a test
// that reads it. Both rules below were measured: Lighthouse on mobile charged
// the font stylesheet 798 ms of render-blocking time, and the analytics library
// is 165 KB competing for a throttled connection during the critical window.
const head = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8"
).split("</head>")[0];

// A stylesheet inside <noscript> is inert for every browser that runs the app,
// so the rule is about the parsed path only.
const parsedHead = head.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");

// Read the rel attribute itself rather than looking for the word anywhere in
// the tag: the swap handler this pattern needs carries the string
// `this.rel='stylesheet'`, and a looser match reads that as the thing it bans.
const linkTags = [...parsedHead.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
const relOf = (tag) => {
  const match = tag.match(/\srel=["']([^"']+)["']/i);
  return match ? match[1].toLowerCase() : "";
};

describe("the font stylesheet", () => {
  it("is not a render-blocking stylesheet link", () => {
    const blocking = linkTags.filter(
      (tag) => relOf(tag) === "stylesheet" && tag.includes("fonts.googleapis.com")
    );

    expect(blocking).toEqual([]);
  });

  it("is still fetched, as a preloaded stylesheet rather than dropped", () => {
    expect(head).toMatch(/<link[^>]*rel=["']preload["'][^>]*as=["']style["']/i);
    expect(head).toMatch(/fonts\.googleapis\.com\/css2\?family=Inter/);
  });

  it("keeps display=swap, so text is readable before the font arrives", () => {
    expect(head).toMatch(/family=Inter[^"']*display=swap/);
  });

  it("still loads for a visitor with no JavaScript", () => {
    expect(head).toMatch(/<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*<\/noscript>/i);
  });

  it("keeps the preconnects that make the font request cheap", () => {
    expect(head).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/);
    expect(head).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/);
  });
});

describe("the analytics library", () => {
  it("is not fetched by a tag the parser finds", () => {
    expect(head).not.toMatch(/<script[^>]*src=["'][^"']*googletagmanager\.com/i);
  });

  // The inline snippet only pushes onto an array, so a pageview recorded before
  // the library arrives is queued and replayed when it does. Removing it would
  // lose the pageview outright, which is the opposite of the point.
  it("still queues the pageview from an inline snippet", () => {
    expect(head).toMatch(/window\.dataLayer = window\.dataLayer \|\| \[\]/);
    expect(head).toMatch(/gtag\('config', 'G-45MK19MZZS'\)/);
  });

  it("is loaded once the page has finished, not during it", () => {
    expect(head).toMatch(/addEventListener\(["']load["']/);
    expect(head).toMatch(/googletagmanager\.com\/gtag\/js\?id=G-45MK19MZZS/);
  });
});
