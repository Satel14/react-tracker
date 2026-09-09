import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, name), "utf8");

// The text ladder in _tokens.scss is picked to read on --bg. Fading a rung of
// it toward `transparent` lands somewhere below the rung -- on whatever is
// behind it -- and that is not a colour anyone checked.
//
// Three labels on the homepage history list did exactly that, and shipped at
// 4.25:1 and 3.56:1 against AA's 4.5. The rule is therefore the simple one:
// name the rung you want. If a dimmer one is needed, the ladder has --text-faint.

const COLOUR_DECLS = /color:\s*([^;]+);/g;

const textColourDecls = () => {
  const out = [];
  const scss = read("mixins.scss");
  const lines = scss.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(COLOUR_DECLS)) {
      const value = m[1].trim();
      if (!/var\(\s*--text-[\w-]+\s*\)/.test(value)) continue;
      out.push({ line: i + 1, value });
    }
  });
  return out;
};

const tokenValue = (name) => {
  for (const line of read("_tokens.scss").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${name}:`)) continue;
    const hex = trimmed.slice(name.length + 1).trim().replace(/;$/, "");
    if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) throw new Error(`${name} is not a hex token: ${hex}`);
    return hex;
  }
  throw new Error(`${name} is not declared in _tokens.scss`);
};

const hexToRgb = (hex) => {
  const h = hex.length === 4
    ? [...hex.slice(1)].map((c) => c + c).join("")
    : hex.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

const luminance = (rgb) => {
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("text colours in the theme mixin", () => {
  it("names a rung of the ladder instead of fading one into the backdrop", () => {
    const faded = textColourDecls().filter((d) => /transparent/.test(d.value));
    expect(faded.map((d) => `mixins.scss:${d.line} ${d.value}`)).toEqual([]);
  });

  it("uses rungs that read on --bg", () => {
    const bg = hexToRgb(tokenValue("--bg"));
    const decls = textColourDecls();

    for (const { line, value } of decls) {
      const token = value.match(/var\(\s*(--text-[\w-]+)\s*\)/)[1];
      const ratio = contrast(hexToRgb(tokenValue(token)), bg);
      // AA for body text: every one of these labels is 12px or smaller, so the
      // 3:1 large-text bar is not on offer.
      expect(ratio, `mixins.scss:${line} ${token}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("is actually looking at declarations", () => {
    // Without this the two tests above pass on an empty list, which is what a
    // typo in the selector regex would produce.
    expect(textColourDecls().length).toBeGreaterThanOrEqual(3);
  });
});
