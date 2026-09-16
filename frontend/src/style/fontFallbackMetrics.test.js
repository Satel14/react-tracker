import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scss = readFileSync(
  fileURLToPath(new URL("./style.scss", import.meta.url)),
  "utf8",
);

// Inter is served with `font-display: swap`, so a page that paints before the
// font arrives draws in a fallback and then swaps. Inter is ~7% wider per
// character than every fallback in the stack, so without a metric override that
// swap re-wraps paragraphs and pushes everything below them down the page.
//
// Measured on /stats-by-rank at 412px before this was fixed: CLS 0.193 over
// three runs, the trace naming the Inter woff2 as the cause. Its sibling
// article pages read 0.000 only because they paint at ~1,300ms, after the font
// has landed; this page paints at ~215ms. So the protection is not "this page
// is fine", it is "the stack is adjusted" -- and any page that gets faster
// starts shifting the moment that stops being true.
//
// Nothing in a jsdom suite can observe a layout shift. This guard exists
// because the only other way to catch a regression here is to notice it in a
// Lighthouse run weeks later.
const ADJUSTED = [
  "Inter Fallback: -apple-system",
  "Inter Fallback: Segoe UI",
  "Inter Fallback: Roboto",
  "Inter Fallback: Arial",
];

describe("Inter fallback metrics", () => {
  it.each(ADJUSTED)("declares %s with a size adjustment", (family) => {
    const start = scss.indexOf(`font-family: "${family}"`);
    expect(start, `no @font-face for ${family}`).toBeGreaterThan(-1);

    // The declaration block this family belongs to, read to its closing brace.
    const open = scss.lastIndexOf("{", start);
    const close = scss.indexOf("}", start);
    const block = scss.slice(open, close);

    // size-adjust is the load-bearing one: it is what makes the fallback occupy
    // the same width. A family declared without it is inert and would pass a
    // weaker "is it mentioned" assertion while shifting exactly as before.
    expect(block, `${family} has no size-adjust`).toMatch(/size-adjust:\s*\d/);
    expect(block, `${family} has no ascent-override`).toMatch(/ascent-override:\s*\d/);
    expect(block, `${family} resolves to no local font`).toMatch(/src:\s*local\(/);
  });

  it("every stack that asks for Inter asks for the adjusted fallbacks first", () => {
    // Only real stacks: ones whose FIRST family is Inter itself. The @font-face
    // rules above declare a single family named "Inter Fallback: …" and would
    // otherwise be swept up as stacks that are missing every fallback.
    const stacks = [...scss.matchAll(/font-family:\s*["']Inter["']\s*,([^;]*);/g)]
      .map((m) => m[1].trim());

    expect(stacks.length, "no Inter stacks found -- has the font changed?").toBeGreaterThan(0);

    for (const stack of stacks) {
      for (const family of ADJUSTED) {
        expect(stack, `stack is missing ${family}: ${stack}`).toContain(family);
      }
      // Order is the whole mechanism: the browser takes the first family it can
      // resolve, so an adjusted fallback listed after its unadjusted twin can
      // never be reached.
      //
      // Compared as a LIST OF FAMILIES, not as substrings of the stack. The
      // first version of this check searched for the plain name starting after
      // the adjusted one -- which is the position the trap hides in front of:
      // `Arial` moved to the head of the stack still matched its own copy in
      // the tail, and the mutation passed. Splitting on commas asks the
      // question the browser actually asks.
      const families = stack.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
      for (const [adjusted, plain] of [
        ["Inter Fallback: -apple-system", "-apple-system"],
        ["Inter Fallback: Segoe UI", "Segoe UI"],
        ["Inter Fallback: Roboto", "Roboto"],
        ["Inter Fallback: Arial", "Arial"],
      ]) {
        const adjustedAt = families.indexOf(adjusted);
        const plainAt = families.indexOf(plain);
        expect(adjustedAt, `${adjusted} missing from ${stack}`).toBeGreaterThan(-1);
        if (plainAt !== -1) {
          expect(plainAt, `${plain} must come after ${adjusted} in ${stack}`).toBeGreaterThan(adjustedAt);
        }
      }
    }
  });
});
