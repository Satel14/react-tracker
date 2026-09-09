import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import themes from "../component/config/themes";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(resolve(here, name), "utf8");

// The favourites count sits on the theme accent, and every accent is a light
// colour -- so the digit has to be the dark theme background, never
// --text-strong. Two things have to hold for that, and they live in two files.
//
// The colours are in mixins.scss. The reset that lets them reach the digit is
// in style.scss: `.navbar span` paints every span in the bar white, and antd
// nests the digit two spans deep inside the count, so a reset on only the inner
// span leaves it inheriting white from its wrapper. That shipped, and read at
// 1.4:1.

const badgeBlock = () => {
  const scss = read("style.scss");
  const m = scss.match(
    /\n {2}\.ant-menu-light \.ant-menu-title-content \.navbar__favorites-badge \{[\s\S]*?\n {2}\}/,
  );
  if (!m) throw new Error(".navbar__favorites-badge block not found in style.scss");
  return m[0];
};

// The trailing space before `{` is what keeps `.ant-scroll-number-only` from
// also matching the `-unit` block and guarding the same rule twice.
const innerBlock = (block, selector) => {
  const m = block.match(new RegExp(`\\n {4}\\${selector} \\{[\\s\\S]*?\\n {4}\\}`));
  if (!m) throw new Error(`${selector} block not found inside .navbar__favorites-badge`);
  return m[0];
};

const themeTextColours = () => {
  const out = {};
  const re = /@include styleCreator\("([\w-]+)",\s*(#[0-9a-fA-F]{3,8})\)/g;
  const mixins = read("mixins.scss");
  let m;
  while ((m = re.exec(mixins))) out[m[1]] = m[2];
  return out;
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

describe("the navbar favourites badge", () => {
  it("lets the count colour reach the digit antd nests inside it", () => {
    const block = badgeBlock();
    for (const selector of [".ant-scroll-number-only", ".ant-scroll-number-only-unit"]) {
      expect(innerBlock(block, selector), selector).toMatch(/\n\s*color: inherit;/);
    }
  });

  it("paints the count the theme background over the theme accent", () => {
    const mixins = read("mixins.scss");
    const rule = mixins.match(/\.ant-badge-count \{[\s\S]*?\n {10}\}/);
    if (!rule) throw new Error(".ant-badge-count block not found in mixins.scss");
    expect(rule[0]).toMatch(/background: var\(--accent\);/);
    expect(rule[0]).toMatch(/color: \$backgroundColorFirst;/);
  });

  it("reads against every accent a theme can paint it", () => {
    const text = themeTextColours();
    const worst = Object.entries(themes)
      .map(([name, accent]) => ({
        name,
        ratio: contrast(hexToRgb(text[name]), hexToRgb(accent)),
      }))
      .sort((a, b) => a.ratio - b.ratio)[0];

    // WCAG AA for body text: the count is 9px, so the 3:1 large-text bar does
    // not apply.
    expect(worst.ratio, `worst is the ${worst.name} theme`).toBeGreaterThanOrEqual(4.5);
  });

  it("covers every theme, not the ones that happened to be checked", () => {
    const text = themeTextColours();
    for (const name of Object.keys(themes)) {
      expect(text[name], `${name} has no styleCreator include in mixins.scss`).toBeDefined();
    }
    expect(Object.keys(themes).length).toBeGreaterThanOrEqual(5);
  });
});
