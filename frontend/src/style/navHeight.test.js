import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scss = readFileSync(fileURLToPath(new URL("./style.scss", import.meta.url)), "utf8");
// The actual file is the Sass partial _tokens.scss (imported as "tokens.scss"
// without the leading underscore/extension) -- see tokens.test.js.
const tokens = readFileSync(fileURLToPath(new URL("./_tokens.scss", import.meta.url)), "utf8");

// Reads a nested SCSS block by brace matching. The `[^}]*` shortcut is what
// made an earlier guard in this repo useless: it stops at the first nested
// closing brace and accepts whatever that inner block declared.
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

const block = (selector) => {
  const at = scss.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} in style.scss`);
  return blockFrom(scss, at);
};

describe("nav height parity", () => {
  it("declares the token", () => {
    expect(tokens).toMatch(/--nav-height:\s*\d+px/);
  });

  // Both navs must be sized from the same token so they cannot drift apart as
  // the navbar changes. This is a guard against a future regression, not the
  // fix for the mount shift itself -- measured, tying the two navs to one
  // token moved CLS almost not at all; the real cause was React.lazy
  // discarding the prerendered article (see eagerRoutes.test.js).
  it.each([".navbar {", ".prerender__nav {"])("sizes %s from the token", (selector) => {
    const body = block(selector);
    expect(body, `${selector} does not use var(--nav-height)`).toMatch(
      /(min-height|height):\s*var\(--nav-height/,
    );
  });
});
