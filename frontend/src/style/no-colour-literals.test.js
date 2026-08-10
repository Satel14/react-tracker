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
const files = globSync("**/*.{scss,jsx,js,css}", { cwd: SRC })
  .filter((f) => !/\.test\.(js|jsx)$/.test(f))
  .map((f) => f.split("\\").join("/"))
  .sort();

const isHex = (c) => c !== undefined && /[0-9a-f]/.test(c);
const NEUTRALS = new Set(["#ffffff", "#000000"]);

const expand = (hex) => {
  const raw = hex.replace("#", "");
  return raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
};

const hexToRgb = (hex) => {
  const full = expand(hex);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const distance = (a, b) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.sqrt(x.reduce((sum, v, i) => sum + (v - y[i]) ** 2, 0));
};

// Read straight from the token source, not a copy — a second set of these
// four values is the exact drift this policy file exists to prevent. Scoped
// to :root the same way tokens.test.js is, so a `.app.<theme>` block that
// later redeclares one of these can't be mistaken for the default.
const tokensSource = read("style/_tokens.scss");
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(tokensSource);
const TEXT_TOKENS = Object.fromEntries(
  [...root[1].matchAll(/^\s*(--text[\w-]*):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]),
);

// In _tokens.scss a retired value is legal ONLY as the value of a --token
// declaration. Exempting the file by path would let a fifth grey in unchallenged.
const legalTokenHome = (file, source, index) => {
  if (file !== "style/_tokens.scss") return false;
  const line = source.slice(0, index).split("\n").pop();
  return /^\s*--[\w-]+:/.test(line);
};

// A translucent neutral is the codebase's overlay vocabulary and is legal on
// paint properties — 103 of them. On `color:` it is a re-spelling of a text
// token. So the exemption is by position, not by value.
//
// Bound to the VALUE, not the line: `color: var(--x); background: rgba(...)`
// is one line with both, and a line-level test would flag the background.
const COLOUR_VALUE = /(?<![-\w])color\s*:\s*[^;{]*$/;

const isColourValue = (source, index) => {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const before = source.slice(lineStart, index);
  const declStart = Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"));
  return COLOUR_VALUE.test(before.slice(declStart + 1));
};

// Spellings are what the literal branch bans; canonical values are what the
// rgba and hex branches compare against. #fff and #ffffff are two spellings
// of one value, and without this a single rgba(255,255,255,…) books twice.
//
// Built by hand rather than `new Map(entries).values()`: that constructor
// keeps the LAST write for a repeated key, which would report "#fff" (it
// comes second in the policy) instead of "#ffffff". Skipping already-seen
// keys keeps the first spelling as the reported id.
const canonicalById = new Map();
for (const c of policy.retiredColours) {
  const full = expand(c);
  if (!canonicalById.has(full)) canonicalById.set(full, c);
}
const CANONICAL = [...canonicalById.values()];

// Takes the source as a parameter rather than reading it, so Task B4 can feed
// it a fixture. Do not collapse this back into a read-inside function.
const scanSource = (file, source) => {
  const lower = source.toLowerCase();
  const hits = [];

  // Literal spellings: #fff and #ffffff are two distinct strings and both
  // must be banned verbatim, so this iterates every entry, duplicates
  // included.
  for (const colour of policy.retiredColours) {
    let i = 0;
    while ((i = lower.indexOf(colour, i)) !== -1) {
      if (!isHex(lower[i + colour.length]) && !legalTokenHome(file, source, i)) {
        hits.push(colour);
      }
      i += colour.length;
    }
  }

  // Canonicalising: rgba() has no spelling, only a value, so this iterates
  // CANONICAL — one entry per distinct colour — or a single physical
  // occurrence would be booked once per spelling that shares its value.
  for (const colour of CANONICAL) {
    // Channels may be comma-separated (legacy) or space-separated (modern
    // rgb(255 155 155 / 16%) syntax); the trailing alpha separator is a comma
    // or a slash either way. No modern-syntax occurrence exists in this
    // codebase today — this only widens what the scanner is ready to catch.
    const neutral = NEUTRALS.has(`#${expand(colour)}`);
    for (const m of lower.matchAll(
      /rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})\s*(?:[,/][^)]*)?\)/g,
    )) {
      const hex = [m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
      if (hex !== expand(colour)) continue;
      if (legalTokenHome(file, source, m.index)) continue;
      if (neutral && !isColourValue(lower, m.index)) continue;
      hits.push(colour);
    }

    // 4- and 8-digit hex carry the alpha in the literal. Compare the 6-digit
    // base and ignore the alpha; the 6-digit branch above cannot see these
    // because its isHex lookahead deliberately steps over them.
    for (const m of lower.matchAll(/#([0-9a-f]{8}|[0-9a-f]{4})\b/g)) {
      const raw = m[1];
      const base = raw.length === 4
        ? raw.slice(0, 3).split("").map((c) => c + c).join("")
        : raw.slice(0, 6);
      if (base !== expand(colour)) continue;
      if (legalTokenHome(file, source, m.index)) continue;
      if (neutral && !isColourValue(lower, m.index)) continue;
      hits.push(colour);
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

// Proximity rule: any `color:` hex nearer than policy.mergeThreshold to a text
// token is a re-spelling of that token, not a new colour. 15 clears every
// literal the migration retired and leaves the legitimately distinct long
// tail alone — the nearest survivor is #6b6f8a at 33.3.
//
// Recorded into `actual` under a "near-duplicate" id the same way scanSource's
// hits are, so the ordinary two-directional ratchet below covers this rule
// like any other id — no separate carve-out in the ratchet tests.
const nearDuplicateHits = [];
for (const file of files) {
  const source = read(file).toLowerCase();
  for (const m of source.matchAll(/color:\s*(#[0-9a-f]{3,6})\b/g)) {
    for (const [name, value] of Object.entries(TEXT_TOKENS)) {
      const gap = distance(m[1], value);
      if (gap < policy.mergeThreshold) {
        nearDuplicateHits.push({ file, hex: m[1], name, gap });
      }
    }
  }
}
for (const hit of nearDuplicateHits) {
  const nearDuplicateKey = key(hit.file, "near-duplicate");
  actual.set(nearDuplicateKey, (actual.get(nearDuplicateKey) || 0) + 1);
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

describe("near-duplicate colours", () => {
  it("reads its four text tokens from _tokens.scss, not from a copy", () => {
    expect(Object.keys(TEXT_TOKENS).sort()).toEqual([
      "--text", "--text-faint", "--text-muted", "--text-strong",
    ]);
  });

  it("has no color: hex across src that restates a text token", () => {
    const seen = new Map();
    const offenders = [];
    for (const hit of nearDuplicateHits) {
      const k = key(hit.file, "near-duplicate");
      const count = (seen.get(k) || 0) + 1;
      seen.set(k, count);
      if (count > (allowed.get(k) || 0)) {
        offenders.push(`${hit.file}: ${hit.hex} is ${hit.gap.toFixed(1)} from ${hit.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the scanner detects literals outside style.scss", () => {
  it("catches a hex, an rgba re-spelling and a banned variable in a new file", () => {
    const fixture = readFileSync(
      fileURLToPath(new URL("./fixtures/known-bad.scss.txt", import.meta.url)),
      "utf8",
    );
    const hits = scanSource("component/NewThing.scss", fixture);
    expect(hits).toContain("#8d91b2");
    expect(hits).toContain("#ff9b9b");
    expect(hits).toContain("$colorFirst");
    expect(hits).toContain("#ffffff");   // neutral, on color: -> caught
    expect(hits).toContain("#0d0918");   // non-neutral, on box-shadow -> caught
  });
});

describe("neutral overlays stay legal on paint properties", () => {
  it("does not flag a neutral that shares a line with a color declaration", () => {
    const hits = scanSource(
      "component/Multi.scss",
      ".x { color: var(--text); background: rgba(255, 255, 255, 0.04); }",
    );
    expect(hits).toEqual([]);
  });

  it("does flag a neutral that is the color value", () => {
    const hits = scanSource("component/Multi.scss", ".x { color: rgba(255, 255, 255, 0.5); }");
    expect(hits).toContain("#ffffff");
  });
});

// policy.retiredColours lists white under two spellings, "#ffffff" and
// "#fff", which both expand to the same value. The literal branch must
// iterate both — they are genuinely distinct strings to ban verbatim — but
// the rgba (and, from Task 2, the hex) branch must iterate canonical values,
// or one physical occurrence gets booked once per spelling that shares it.
describe("one physical rgba occurrence books exactly one hit", () => {
  it("does not double-count a single color: rgba(255, 255, 255, ...) under both white spellings", () => {
    const hits = scanSource("component/Multi.scss", ".x { color: rgba(255, 255, 255, 0.5); }");
    expect(hits).toHaveLength(1);
  });
});

describe("8-digit hex alpha fidelity", () => {
  it("keeps the exact 0xd9 alpha rather than rounding to 85%", () => {
    const stylesheet = read("style/style.scss");
    expect(stylesheet).toContain("var(--text-strong) 85.098%");
    expect(stylesheet).not.toContain("var(--text-strong) 85%");
  });
});
