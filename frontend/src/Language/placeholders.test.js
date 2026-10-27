import { describe, it, expect } from "vitest";
import en from "./en.json";
import ua from "./ua.json";

// react-switch-lang fills a placeholder with String.prototype.replace and a
// string pattern (node_modules/react-switch-lang/index.js), which replaces the
// first occurrence only. A second {name} in one string reaches the page as
// literal braces -- the launcher hint shipped that way to a preview on
// 2026-10-27.
const repeated = (dictionary) => {
  const found = [];
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      const at = [...path, key];
      if (value && typeof value === "object") walk(value, at);
      else if (typeof value === "string") {
        const names = [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
        const twice = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
        if (twice.length) found.push(`${at.join(".")}: {${twice.join("}, {")}}`);
      }
    }
  };
  walk(dictionary, []);
  return found;
};

describe("placeholders", () => {
  it.each([["en", en], ["ua", ua]])("no %s string uses the same placeholder twice", (_language, dictionary) => {
    expect(repeated(dictionary)).toEqual([]);
  });
});
