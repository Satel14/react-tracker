import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scss = readFileSync(
  fileURLToPath(new URL("./style.scss", import.meta.url)),
  "utf8",
);

// Reads a nested SCSS block by brace matching, so a rule inside it is not
// mistaken for the end of it.
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

// The phone drawer is mounted on every page whether or not it is open, because
// a crawler at a phone viewport needs those anchors in the raw HTML. That makes
// "closed" a paint state, and the only thing hiding it is one display:none at
// the same specificity as the overlay's own display:flex. Sass preserves source
// order, so the one written last wins -- and for one release the none was
// written first and lost, leaving a full-screen backdrop and drawer over every
// page under 960px. Nothing in jsdom can see that: it needs the stylesheet.
describe("the phone drawer is hidden while it is closed", () => {
  it("declares --closed after the overlay's own display, not before it", () => {
    const start = scss.indexOf("&__mobile-overlay {");
    expect(start, "no &__mobile-overlay block in style.scss").toBeGreaterThan(-1);

    const block = blockFrom(scss, start);
    const shown = block.indexOf("display: flex");
    const hidden = block.indexOf("display: none");

    expect(shown, "the overlay declares no display of its own").toBeGreaterThan(-1);
    expect(hidden, "nothing hides the overlay when it is closed").toBeGreaterThan(-1);
    expect(hidden).toBeGreaterThan(shown);
  });
});
