import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), "utf8");

// The legend is the one place a viewer can learn what the canvas is painting,
// and it rots in a particular way: an encoding gets added and the legend does
// not, or a legend row loses the swatch that gave it a colour and renders as a
// label with a hole where the mark should be. Both are invisible in a unit
// test of either file alone, so this reads the two together.
const legendClasses = () => {
  const src = read("../pages/MatchReplayPage.jsx");
  const block = src.match(/const LEGEND = \[[\s\S]*?\n\];/);
  if (!block) throw new Error("LEGEND not found in MatchReplayPage.jsx");
  return (block[0].match(/cls: "([\w-]+)"/g) || []).map((m) => m.slice(6, -1));
};

const swatchClasses = () => {
  const scss = read("style.scss");
  const open = scss.indexOf("&__swatch {");
  if (open === -1) throw new Error("__swatch block not found in style.scss");
  const close = scss.indexOf("\n  }", open);
  const block = scss.slice(open, close);
  return (block.match(/&\.([\w-]+) \{/g) || []).map((m) => m.slice(2, -2));
};

describe("the replay legend", () => {
  it("gives every row a swatch", () => {
    const missing = legendClasses().filter((c) => !swatchClasses().includes(c));
    expect(missing, "legend rows with no swatch rule render a hole").toEqual([]);
  });

  it("keeps no swatch nothing points at", () => {
    const orphans = swatchClasses().filter((c) => !legendClasses().includes(c));
    expect(orphans, "swatch rules no legend row uses are dead style").toEqual([]);
  });

  it("names every row in both locales", () => {
    const src = read("../pages/MatchReplayPage.jsx");
    const block = src.match(/const LEGEND = \[[\s\S]*?\n\];/)[0];
    const keys = (block.match(/key: "(\w+)"/g) || []).map((m) => m.slice(6, -1));
    expect(keys.length).toBe(legendClasses().length);
    for (const locale of ["en", "ua"]) {
      const dict = JSON.parse(read(`../Language/${locale}.json`)).pages.replay;
      for (const key of keys) expect(dict[key], `${locale}.${key}`).toBeTruthy();
    }
  });
});
