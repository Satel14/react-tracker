import { describe, it, expect } from "vitest";
import { prerenderBody, PRERENDERED_ROUTES } from "./prerenderBody";
import en from "../Language/en.json";

const ranks = () => prerenderBody("/ranks");

describe("which routes ship their article", () => {
  // The other fixed routes are applications, not reading. A heading and a
  // sentence is the right amount of static text for a leaderboard, and the
  // homepage's file is also what Pages serves for every unmatched URL, so
  // prose in it would become duplicate copy across an unbounded set of them.
  it("renders the ranks article and nothing else", () => {
    expect(PRERENDERED_ROUTES).toEqual(["/ranks"]);
  });

  it("says nothing for a route that is not prerendered", () => {
    expect(prerenderBody("/leaderboards")).toBeNull();
    expect(prerenderBody("/")).toBeNull();
  });
});

describe("the ranks article as a crawler receives it", () => {
  // The whole point. Before this, the static file carried the h1 and one
  // sentence -- about fifty words of a seventeen-hundred-word article -- and
  // everything else existed only after the bundle ran.
  it("carries every paragraph the copy defines", () => {
    const html = ranks();
    const written = Object.entries(en.pages.ranks)
      .filter(([, value]) => value && typeof value === "object")
      .flatMap(([, value]) => Object.entries(value).filter(([key]) => /^p\d+$/.test(key)))
      .map(([, text]) => text);

    expect(written.length).toBeGreaterThan(40);
    for (const text of written) {
      // Compared after entity-decoding: renderToStaticMarkup escapes the
      // apostrophes and ampersands the copy is full of.
      expect(decode(html), text.slice(0, 40)).toContain(text);
    }
  });

  it("carries every section heading", () => {
    const html = decode(ranks());
    const headings = Object.entries(en.pages.ranks)
      .filter(([, value]) => value && typeof value === "object" && value.heading)
      .map(([, value]) => value.heading);

    expect(headings.length).toBeGreaterThan(8);
    for (const heading of headings) {
      expect(html, heading).toContain(heading);
    }
  });

  // Scoped to the ladder itself. Searching the whole document finds
  // "Survivor" in the contents rail long before the table, which says
  // nothing about the order the tiers are listed in.
  it("names the tiers in ladder order", () => {
    const html = ranks();
    // By the class the ladder puts on each row, not by slicing the <ol>:
    // the division pips are a nested list, so the first </ol> closes the
    // first tier rather than the table.
    const names = [...html.matchAll(/class="ranks-page__tier-name">([A-Za-z]+)/g)]
      .map((match) => match[1]);
    expect(names).toEqual([
      "Bronze", "Silver", "Gold", "Platinum", "Crystal", "Diamond", "Master", "Survivor",
    ]);
    expect(html).not.toContain("Grandmaster tier is");
  });

  // The h1 a crawler reads and the h1 React renders have to be the same
  // sentence. Rendering the component is what makes that true by construction
  // rather than by two people remembering to edit both.
  it("opens with the page's own h1", () => {
    expect(decode(ranks())).toContain(`<h1>${en.pages.ranks.title}</h1>`);
  });

  it("is a whole article rather than a stub", () => {
    const words = ranks().replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(1500);
  });

  // No router context, no fetch, no window: the build has none of them, and a
  // component that reached for one would throw the build rather than quietly
  // shipping half a page.
  it("renders without a live app around it", () => {
    expect(() => ranks()).not.toThrow();
  });
});

const decode = (html) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
