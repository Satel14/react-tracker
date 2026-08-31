import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const scss = () => readFileSync(resolve(here, "style.scss"), "utf8");

// Vitest runs with css: false, so no component test can see a stylesheet rule.
// That is fine for most of them -- a colour or a gap that drifts is visible the
// next time anyone looks at the page -- but not for a rule that carries
// meaning. This file guards the ones where the stylesheet is making a claim
// about the data rather than about the look, by reading the source.
const feedBlock = () => {
  const match = scss().match(/\n\.replay-feed \{[\s\S]*?\n\}/);
  if (!match) throw new Error(".replay-feed block not found in style.scss");
  return match[0];
};

// Sliced rather than matched: a pattern built from a string needs its
// backslashes doubled to survive into the RegExp, and getting that wrong is
// silent -- the class lands as [sS], matches nothing, and the guard reports a
// missing block instead of a missing rule.
const ruleFor = (name) => {
  const block = feedBlock();
  const open = block.indexOf(`&__${name} {`);
  if (open === -1) throw new Error(`.replay-feed__${name} block not found`);
  const close = block.indexOf("\n  }", open);
  if (close === -1) throw new Error(`.replay-feed__${name} block never closes`);
  return block.slice(open, close);
};

describe("the kill feed's stylesheet", () => {
  it("turns the weapon to point at whoever it hit", () => {
    // PUBG ships these icons muzzle-left. The feed reads left to right --
    // killer, weapon, victim -- so an unflipped gun points back at the person
    // who fired it. Dropping this line is invisible to every other test in the
    // suite, which is the whole reason this one exists.
    expect(ruleFor("weapon")).toMatch(/transform:\s*scaleX\(-1\)/);
  });

  it("lets a name take the pointer, and nothing else in the overlay", () => {
    // The feed is transparent to pointers on purpose: any pixel of it that
    // swallows one freezes dragging in that corner of the map. A link cannot be
    // clicked without taking one, so the trade is made on the link alone --
    // and nowhere else in the block, or the map stops dragging over the badges
    // and the weapon too.
    expect(ruleFor("link")).toMatch(/pointer-events:\s*auto/);
    const block = feedBlock();
    const autos = block.match(/pointer-events:\s*auto/g) || [];
    expect(autos).toHaveLength(1);
    // And the container itself still refuses them.
    expect(block).toMatch(/pointer-events:\s*none/);
  });

  it("sizes the weapon by height so every gun shares a baseline", () => {
    // Width auto, height fixed: a pistol and a sniper rifle have very
    // different aspects and sizing by width would make one of them tiny.
    const rule = ruleFor("weapon");
    expect(rule).toMatch(/height:\s*\d+px/);
    expect(rule).toMatch(/width:\s*auto/);
  });
});
