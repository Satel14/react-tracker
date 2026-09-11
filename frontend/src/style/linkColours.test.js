import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scss = readFileSync(
  fileURLToPath(new URL("./style.scss", import.meta.url)),
  "utf8",
);

// Reads a nested SCSS block by brace matching, so a rule inside it is not
// mistaken for the end of it. A `[^}]*` shortcut here is what made the first
// version of this guard useless: it stopped at the closing brace of `&:hover`
// and then accepted that block's `color` as the anchor's own.
const blockFrom = (source, start) => {
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces at ${start}`);
};

const blockBody = (selector) => {
  const start = scss.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in style.scss`);
  return blockFrom(scss, start);
};

// A bare nested selector like `&__lang` is ambiguous the moment two blocks
// define one: `scss.indexOf` on it resolves to whichever occurrence comes
// first in the whole file, not the one the caller means. That is exactly the
// bug this guard had -- `blockBody("&__lang")` was reading `.ranks-page`'s
// `&__lang` while this file believed it was checking `.rank-points`'s, and
// the `.rank-points` link was never actually verified. Scoping the lookup to
// a named parent first removes the ambiguity, for both the old block and the
// new one.
const nestedBlockBody = (parent, selector) => {
  const outer = blockBody(parent);
  const start = outer.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} inside ${parent}`);
  return blockFrom(outer, start);
};

// The declarations a rule makes itself, with every nested block removed -- so a
// colour that only exists on :hover cannot stand in for the resting one.
const ownDeclarations = (rule) => {
  const inner = rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));
  let out = "";
  let depth = 0;
  for (const character of inner) {
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (depth === 0) out += character;
  }
  return out;
};

// An anchor with no colour of its own falls to the browser's link and
// visited-link defaults -- blue and purple, which belong to no theme here and
// look like a rendering bug on a dark ground. Every block that introduces a
// prose link has to say what colour it is.
//
// This list is the blocks that hold one. It grows when a new prose link ships.
const BLOCKS_WITH_PROSE_LINKS = [
  ".ranks-page",
  // Listed separately from .ranks-page on purpose: that block's `a` rule lives
  // inside __toc-list, so the entry above is satisfied without saying anything
  // about the census note's two data-file links.
  "&__share-note",
  ".leaderboard-page__explainer",
  ".leaderboard-intro",
  ".prerender__nav",
  ".home-intro",
];

// `[parent, child]` pairs rather than bare child selectors, so a lookup can
// never resolve to the wrong block: two different pages each nest a `&__lang`
// and a `&__outro`, and only the parent tells them apart.
//
// Links whose colour sits on a nested `a { }` rule -- the block itself has no
// class of its own, so the anchor is reached by its parent's `a` selector.
const NESTED_ANCHOR_LINKS = [
  [".ranks-page", "&__outro"],
  [".rank-points", "&__outro"],
];

// Links that carry their own class, so the colour sits on the block's own
// declarations rather than on a nested `a` rule. The language link rendered
// in the browser's visited purple on a live page until this pinned it, which
// is exactly the failure the block guard above misses.
const OWN_COLOUR_LINKS = [
  [".ranks-page", "&__lang"],
  [".rank-points", "&__lang"],
];

describe("prose links state their own colour", () => {
  it.each(BLOCKS_WITH_PROSE_LINKS)("%s gives its anchors a resting colour", (selector) => {
    const body = blockBody(selector);
    const anchorAt = /^\s*a\s*\{/m.exec(body);
    expect(anchorAt, `${selector} has no rule for a`).not.toBeNull();
    const declarations = ownDeclarations(blockFrom(body, anchorAt.index));
    expect(declarations, `${selector} a { } sets no colour of its own`).toMatch(
      /color:\s*var\(--/
    );
  });

  it.each(NESTED_ANCHOR_LINKS)(
    "%s %s gives its anchor a resting colour",
    (parent, selector) => {
      const body = nestedBlockBody(parent, selector);
      const anchorAt = /^\s*a\s*\{/m.exec(body);
      expect(anchorAt, `${parent} ${selector} has no rule for a`).not.toBeNull();
      const declarations = ownDeclarations(blockFrom(body, anchorAt.index));
      expect(
        declarations,
        `${parent} ${selector} a { } sets no colour of its own`
      ).toMatch(/color:\s*var\(--/);
    }
  );

  it.each(OWN_COLOUR_LINKS)("%s %s states a resting colour of its own", (parent, selector) => {
    expect(
      ownDeclarations(nestedBlockBody(parent, selector)),
      `${parent} ${selector} sets no colour`
    ).toMatch(/color:\s*var\(--/);
  });

  it("finds the blocks it is meant to be guarding", () => {
    // A selector renamed out from under this list would make every assertion
    // above throw rather than pass, but a list that shrank to nothing would
    // pass silently.
    expect(BLOCKS_WITH_PROSE_LINKS.length).toBeGreaterThan(1);
    expect(NESTED_ANCHOR_LINKS.length).toBeGreaterThan(1);
    expect(OWN_COLOUR_LINKS.length).toBeGreaterThan(1);
  });
});
