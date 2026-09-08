import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), "utf8");

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.jsx$/.test(name) && !/\.test\.jsx$/.test(name) ? [full] : [];
  });

const sorted = (values) => [...new Set(values)].sort();

// A skeleton variant with no rule behind it is a span with no width and no
// height: it renders as literally nothing, so the loading state goes blank
// rather than wrong. The names live in JSX and the sizes live in the
// stylesheet, and neither file can catch the mismatch alone.
const declaredVariants = () => {
  const src = read("../component/Skeleton.jsx");
  const block = src.match(/const SKELETON_VARIANTS = \[[\s\S]*?\];/);
  if (!block) throw new Error("SKELETON_VARIANTS not found in Skeleton.jsx");
  return sorted((block[0].match(/"([\w-]+)"/g) || []).map((m) => m.slice(1, -1)));
};

const definedVariants = () => {
  const scss = read("style.scss");
  const open = scss.indexOf(".skeleton {");
  if (open === -1) throw new Error(".skeleton block not found in style.scss");
  const close = scss.indexOf("\n}", open);
  const block = scss.slice(open, close);
  return sorted((block.match(/&--([\w-]+) \{/g) || []).map((m) => m.slice(3, -2)));
};

const referencedVariants = () => {
  const names = [];
  for (const file of walk(resolve(here, ".."))) {
    const src = readFileSync(file, "utf8");
    // Spelled out in a className, as the hand-written tiles do.
    for (const match of src.matchAll(/skeleton--([\w-]+)/g)) names.push(match[1]);
    // Passed to SkeletonTile. Only the skeleton components are scanned, so an
    // unrelated component's own `variant` prop cannot be mistaken for one.
    if (file.includes(join("component", "skeletons"))) {
      for (const match of src.matchAll(/variant="([\w-]+)"/g)) names.push(match[1]);
    }
  }
  return sorted(names);
};

describe("skeleton variants", () => {
  it("only renders variants the primitive declares", () => {
    const unknown = referencedVariants().filter((v) => !declaredVariants().includes(v));
    expect(unknown, "a misspelled variant renders a zero-sized span").toEqual([]);
  });

  it("gives every declared variant a size", () => {
    const missing = declaredVariants().filter((v) => !definedVariants().includes(v));
    expect(missing, "a variant with no rule renders a zero-sized span").toEqual([]);
  });

  it("keeps no rule for a variant nothing declares", () => {
    const orphans = definedVariants().filter((v) => !declaredVariants().includes(v));
    expect(orphans, "variants no component can render are dead style").toEqual([]);
  });

  it("keeps skeleton--text full width, since rows and cells are built from it", () => {
    // It used to be capped at 120px, which is why a placeholder for a
    // full-width table row came out as a short dash on the left.
    const rule = read("style.scss").match(/&--text \{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).not.toMatch(/max-width/);
  });

  it("drops the centring wrappers that pushed loaders away from their content", () => {
    // Each of these was a flex box that centred one tile in an empty area
    // instead of letting it sit where the content lands.
    const scss = read("style.scss");
    for (const dead of [
      ".playerpage__loading",
      ".match-replay__loading",
      ".leaderboard-page__loading",
      ".compare-column__loading",
      ".skeleton-group",
    ]) {
      expect(scss, `${dead} is dead style`).not.toContain(dead);
    }
  });
});
