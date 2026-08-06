import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const stylesheet = readFileSync(
  fileURLToPath(new URL("./style.scss", import.meta.url)),
  "utf8",
);

// Literals that have been folded into a token. They must never reappear:
// _tokens.scss is the only place their values are allowed to live.
const RETIRED = [
  "#ffffff", "#fff",
  "#d6d9ee", "#d6e0f0", "#d6d9ed", "#c8cbe0", "#d2d6f0", "#cfd3e6",
  "#9da1bf", "#8d91b2", "#9fa3bf", "#9697b0", "#aeb8c8", "#aeb2cf", "#8e93b3",
  "#7d809e",
  "#0d0918", "#0c1422",
];

// Any `color:` hex nearer than this to a text token is a re-spelling of that
// token, not a new colour. 15 clears every literal the migration retires and
// leaves the legitimately distinct long tail alone — the nearest survivor is
// #e8fff3 at 25.9.
const MERGE_THRESHOLD = 15;

const TEXT_TOKENS = {
  "--text-strong": "#ffffff",
  "--text": "#d6d9ee",
  "--text-muted": "#9da1bf",
  "--text-faint": "#7a7fa3",
};

const hexToRgb = (hex) => {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const distance = (a, b) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.sqrt(x.reduce((sum, v, i) => sum + (v - y[i]) ** 2, 0));
};

const occurrences = (literal) => {
  const haystack = stylesheet.toLowerCase();
  const isHex = (c) => c !== undefined && /[0-9a-f]/.test(c);
  const found = [];
  let index = 0;
  while ((index = haystack.indexOf(literal, index)) !== -1) {
    if (!isHex(haystack[index + literal.length])) {
      found.push(stylesheet.slice(0, index).split("\n").length);
    }
    index += literal.length;
  }
  return found;
};

describe("retired literals", () => {
  it.each(RETIRED)("%s no longer appears in style.scss", (literal) => {
    expect(occurrences(literal)).toEqual([]);
  });
});

describe("near-duplicate colours", () => {
  it("has no color: hex that restates a text token", () => {
    const offenders = [];
    for (const match of stylesheet.matchAll(/color:\s*(#[0-9a-f]{3,6})\b/gi)) {
      for (const [name, value] of Object.entries(TEXT_TOKENS)) {
        const gap = distance(match[1], value);
        if (gap < MERGE_THRESHOLD) {
          offenders.push(`${match[1]} is ${gap.toFixed(1)} from ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("surface literals", () => {
  it("uses the --border token for the hairline alpha", () => {
    expect(stylesheet).not.toContain("rgba(255, 255, 255, 0.08)");
  });

  it("no longer declares the legacy background SCSS variable", () => {
    expect(stylesheet).not.toContain("$backgroundColorFirst");
  });
});
