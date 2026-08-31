import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { teamColor } from "../component/charts/replaySprites";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, name), "utf8");

// The kill feed sets a team's colour as the BACKGROUND of its number badge,
// which makes the badge's own text colour a contrast question against twelve
// palette colours at once rather than against one surface. Those colours are
// picked to sit on a dark map raster, so they are light -- and the first draft
// of this badge used --text-strong, which is white on light green.
//
// Read out of the stylesheet rather than restated here: a guard that carries
// its own copy of the rule cannot catch the rule changing.
const badgeTextToken = () => {
  const scss = read("style.scss");
  // Scoped to .replay-feed first: the roster has an &__team of its own, and
  // matching the wrong one would guard a rule this test is not about.
  const feed = scss.match(/\n\.replay-feed \{[\s\S]*?\n\}/);
  if (!feed) throw new Error(".replay-feed block not found in style.scss");
  const block = feed[0].match(/&__team \{[\s\S]*?\n {2}\}/);
  if (!block) throw new Error(".replay-feed__team block not found in style.scss");
  const decl = block[0].match(/\n\s*color: var\((--[\w-]+)\)/);
  if (!decl) throw new Error("no `color: var(--token)` in the .replay-feed__team block");
  return decl[1];
};

const tokenValue = (name) => {
  // Scanned line by line rather than by a regex built from `name`: the token
  // names start with two dashes, and interpolating those into a pattern is a
  // way to write a regex that quietly matches something else.
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

const hslToRgb = (h, s, l) => {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const k = (n) => (n + h / 30) % 12;
  return [0, 8, 4].map((n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
};

const luminance = (rgb) => {
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const teamColors = () => {
  const out = [];
  for (let i = 1; i <= 64; i += 1) {
    const css = teamColor(i);
    if (!css) continue;
    const m = css.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (!m) throw new Error(`teamColor(${i}) is not an hsl() triple: ${css}`);
    out.push({ index: i, css, rgb: hslToRgb(+m[1], +m[2], +m[3]) });
  }
  return out;
};

describe("the feed's team badge", () => {
  it("reads against every colour the palette can paint it", () => {
    const text = hexToRgb(tokenValue(badgeTextToken()));
    const worst = teamColors()
      .map(({ index, css, rgb }) => ({ index, css, ratio: contrast(text, rgb) }))
      .sort((a, b) => a.ratio - b.ratio)[0];

    // WCAG AA for body text. The badge is small, so this is the bar that
    // applies -- not the 3:1 large-text one.
    expect(worst.ratio, `worst is team ${worst.index} ${worst.css}`).toBeGreaterThanOrEqual(4.5);
  });

  it("covers the whole palette, not the one colour that happened to be checked", () => {
    // If teamColor ever returns fewer rows the test above would pass on a
    // sample of one, which is the failure mode it exists to prevent.
    expect(teamColors().length).toBeGreaterThanOrEqual(8);
  });
});
