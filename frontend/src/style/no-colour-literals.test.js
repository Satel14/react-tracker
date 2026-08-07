import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import policy from "./colour-policy.json";

// Resolve with path.join, never string concatenation — fileURLToPath's trailing
// separator is platform-dependent and this repo is developed on Windows.
const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(SRC, file), "utf8");

// .json is deliberately outside this list: the policy file must not scan itself.
// Test files are excluded because they are not shipped.
const files = globSync("**/*.{scss,jsx,js}", { cwd: SRC })
  .filter((f) => !/\.test\.(js|jsx)$/.test(f))
  .map((f) => f.split("\\").join("/"))
  .sort();

const isHex = (c) => c !== undefined && /[0-9a-f]/.test(c);
const NEUTRALS = new Set(["#ffffff", "#000000"]);

const expand = (hex) => {
  const raw = hex.replace("#", "");
  return raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
};

// In _tokens.scss a retired value is legal ONLY as the value of a --token
// declaration. Exempting the file by path would let a fifth grey in unchallenged.
const legalTokenHome = (file, source, index) => {
  if (file !== "style/_tokens.scss") return false;
  const line = source.slice(0, index).split("\n").pop();
  return /^\s*--[\w-]+:/.test(line);
};

// Takes the source as a parameter rather than reading it, so Task B4 can feed
// it a fixture. Do not collapse this back into a read-inside function.
const scanSource = (file, source) => {
  const lower = source.toLowerCase();
  const hits = [];

  for (const colour of policy.retiredColours) {
    let i = 0;
    while ((i = lower.indexOf(colour, i)) !== -1) {
      if (!isHex(lower[i + colour.length]) && !legalTokenHome(file, source, i)) {
        hits.push(colour);
      }
      i += colour.length;
    }
    if (NEUTRALS.has(`#${expand(colour)}`)) continue;
    // Channels may be comma-separated (legacy) or space-separated (modern
    // rgb(255 155 155 / 16%) syntax); the trailing alpha separator is a comma
    // or a slash either way. No modern-syntax occurrence exists in this
    // codebase today — this only widens what the scanner is ready to catch.
    for (const m of lower.matchAll(
      /rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})\s*(?:[,/][^)]*)?\)/g,
    )) {
      const hex = [m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
      if (hex === expand(colour) && !legalTokenHome(file, source, m.index)) {
        hits.push(colour);
      }
    }
  }

  for (const banned of policy.bannedStrings) {
    let i = 0;
    while ((i = source.indexOf(banned, i)) !== -1) {
      hits.push(banned);
      i += banned.length;
    }
  }

  for (const { id, pattern } of policy.bannedPatterns) {
    const count = [...lower.matchAll(new RegExp(pattern, "g"))].length;
    hits.push(...Array(count).fill(id));
  }

  return hits;
};

const key = (file, id) => `${file}|${id}`;

const actual = new Map();
for (const file of files) {
  for (const id of scanSource(file, read(file))) {
    actual.set(key(file, id), (actual.get(key(file, id)) || 0) + 1);
  }
}

const allowed = new Map(
  policy.exemptions.map((e) => [key(e.file, e.id), e.count]),
);

describe("colour literals across src", () => {
  it("scans more than the two files the old guards read", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("style/style.scss");
    expect(files).toContain("component/charts/MatchCharts.jsx");
    expect(files).not.toContain("style/colour-policy.json");
  });

  it("introduces no literal beyond what the exemption list records", () => {
    const excess = [...actual]
      .filter(([k, n]) => n > (allowed.get(k) || 0))
      .map(([k, n]) => `${k}: ${n} found, ${allowed.get(k) || 0} allowed`);
    expect(excess).toEqual([]);
  });

  it("has no stale exemption — the list may only shrink", () => {
    const stale = [...allowed]
      .filter(([k, n]) => (actual.get(k) || 0) < n)
      .map(([k, n]) => `${k}: ${n} allowed, only ${actual.get(k) || 0} found — lower it`);
    expect(stale).toEqual([]);
  });
});

describe("modern rgb() syntax", () => {
  it("canonicalises space-separated channels with a slash alpha", () => {
    const hits = scanSource("fixture.jsx", "border: 1px solid rgb(255 155 155 / 16%);");
    expect(hits).toContain("#ff9b9b");
  });

  it("still canonicalises the legacy comma-separated form", () => {
    const hits = scanSource("fixture.jsx", "border: 1px solid rgba(255, 155, 155, 0.16);");
    expect(hits).toContain("#ff9b9b");
  });
});
