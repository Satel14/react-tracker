import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const stylesheet = readFileSync(
  fileURLToPath(new URL("./style.scss", import.meta.url)),
  "utf8",
);

// The global literal scan (no-colour-literals.test.js) bans #ffffff and
// #000000 as strings, so the same value written as rgba() would otherwise
// slip through unnoticed. Alpha is ignored: rgba(255, 155, 155, 0.16) and
// (…, 0.35) are both #ff9b9b.
//
// #ffffff and #000000 are excluded from THIS check only. They stay banned as
// literal hex globally, but their rgba() forms are the neutral overlay
// vocabulary the token spec deliberately kept as literals — 34 of them across
// this file. Without the exclusion this check is a false-positive wave, and
// the next person deletes the whole thing.
const NEUTRALS = new Set(["#ffffff", "#000000"]);

const rgbaOccurrences = (literal) => {
  const raw = literal.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (NEUTRALS.has(`#${full}`)) return [];
  const found = [];
  for (const m of stylesheet.matchAll(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,[^)]*)?\)/g,
  )) {
    const hex = [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
    if (hex === full) found.push(stylesheet.slice(0, m.index).split("\n").length);
  }
  return found;
};

describe("neutral overlays stay literal", () => {
  it("does not flag translucent white, which the token spec kept as a literal", () => {
    expect(stylesheet).toContain("rgba(255, 255, 255, 0.05)");
    expect(rgbaOccurrences("#ffffff")).toEqual([]);
  });
});

describe("surface literals", () => {
  it("uses the --border token for the hairline alpha", () => {
    expect(stylesheet).not.toContain("rgba(255, 255, 255, 0.08)");
  });
});

describe("brand alpha values", () => {
  // Absence of `rgba(` proves nothing about the alpha that replaced it: a naive
  // sed turns 0.5 into 5% and 0.05 into 5% alike, and the global retired-colour
  // scan still passes. Pin the whole distinct set so a decimal shift fails
  // loudly. A legitimate new alpha fails this too — update the list deliberately.
  it("preserves every alpha through the percentage conversion", () => {
    const percents = [
      ...stylesheet.matchAll(/color-mix\(in srgb, var\(--[a-z-]+\) ([0-9.]+)%/g),
    ].map((match) => Number(match[1]));
    expect([...new Set(percents)].sort((a, b) => a - b)).toEqual([
      5, 7, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 26, 28, 30, 32,
      35, 40, 45, 50, 55, 70, 75, 80, 85, 95,
    ]);
  });
});

describe("semantic colours", () => {
  const semanticLines = [
    "&--win { background: var(--win);",
    "&--top10 { background: var(--ok); }",
  ];

  it.each(semanticLines)("keeps %s unthemed", (line) => {
    expect(stylesheet).toContain(line);
  });

  it("uses --ok for the roster focal name", () => {
    expect(stylesheet).toMatch(/is-focal \.replay-roster__name \{ color: var\(--ok\); \}/);
  });

  it("uses --win for the player-place-badge win tier, alphas preserved", () => {
    expect(stylesheet).toMatch(
      /&--win \{\s*color: var\(--win\);\s*border-color: color-mix\(in srgb, var\(--win\) 55%, transparent\);\s*background: color-mix\(in srgb, var\(--win\) 12%, transparent\);\s*box-shadow: 0 0 0 1px color-mix\(in srgb, var\(--win\) 8%, transparent\), 0 0 12px color-mix\(in srgb, var\(--win\) 18%, transparent\);\s*\}/,
    );
  });

  it("uses --ok for the player-place-badge top10 tier, alphas preserved", () => {
    expect(stylesheet).toMatch(
      /&--top10 \{\s*color: var\(--ok\);\s*border-color: color-mix\(in srgb, var\(--ok\) 50%, transparent\);\s*background: color-mix\(in srgb, var\(--ok\) 12%, transparent\);\s*\}/,
    );
  });

  it("keeps the won-match row border on --win", () => {
    expect(stylesheet).toMatch(
      /&--win \{\s*border-color: color-mix\(in srgb, var\(--win\) 45%, transparent\);/,
    );
  });

  it("keeps the compare winner cell on --ok", () => {
    expect(stylesheet).toMatch(
      /&--winner \{\s*color: #62ec96;\s*background: color-mix\(in srgb, var\(--ok\) 16%, transparent\);\s*box-shadow: inset 0 0 0 1px color-mix\(in srgb, var\(--ok\) 40%, transparent\);\s*\}/,
    );
  });

  it("keeps the encounter kill stripe on --ok", () => {
    expect(stylesheet).toMatch(
      /&--kill::before \{\s*background: linear-gradient\(180deg, var\(--ok\), #2fa363\);\s*\}/,
    );
  });

  // Seven of the eight rank tiers are hardcoded literals. Gold gets a token
  // only because #fde82b is retired, and it must stay unthemed like its peers.
  it("keeps the gold rank tier on its own unthemed token", () => {
    expect(stylesheet).toMatch(
      /color-mix\(in srgb, var\(--tier-gold\) 22%, transparent\)/,
    );
    expect(stylesheet).toMatch(
      /box-shadow: inset 0 0 0 1px color-mix\(in srgb, var\(--tier-gold\) 32%, transparent\);/,
    );
    expect(stylesheet).not.toMatch(/player-card--tier-gold[\s\S]{0,400}var\(--brand\)/);
  });

  it("keeps the scoreboard win badge on --win", () => {
    expect(stylesheet).toMatch(/&__won \{\s*color: var\(--bg\);\s*background: var\(--win\);/);
  });
});
