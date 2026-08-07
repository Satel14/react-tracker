import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import themes from "../component/config/themes";

const source = readFileSync(
  fileURLToPath(new URL("./_tokens.scss", import.meta.url)),
  "utf8",
);

// Scoped to the :root block on purpose. Task 5.3 appends `.app.<theme>` blocks
// that redeclare --accent; a whole-file scan would silently return the last
// theme's value as if it were the default.
const parseTokens = (src) => {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(src);
  if (!root) throw new Error("no :root block in _tokens.scss");
  const out = {};
  for (const line of root[1].split("\n")) {
    const match = /^\s*(--[\w-]+):\s*([^;]+);/.exec(line);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
};

const hexToRgb = (hex) => {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const channel = (value) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const tokens = parseTokens(source);

describe("colour tokens", () => {
  it("defines the expected token set", () => {
    expect(Object.keys(tokens).sort()).toEqual([
      "--accent", "--bg", "--border", "--brand", "--danger", "--ok",
      "--rest", "--surface", "--text", "--text-faint", "--text-muted",
      "--text-strong", "--tier-gold", "--win",
    ]);
  });

  const textTokens = Object.keys(tokens).filter((n) => n.startsWith("--text"));

  it("has four text tokens", () => {
    expect(textTokens).toHaveLength(4);
  });

  it.each(["--text-strong", "--text", "--text-muted", "--text-faint"])(
    "%s meets WCAG AA against --bg",
    (name) => {
      expect(contrast(tokens[name], tokens["--bg"])).toBeGreaterThanOrEqual(4.5);
    },
  );
});

const stylesheet = readFileSync(
  fileURLToPath(new URL("./style.scss", import.meta.url)),
  "utf8",
);

describe("stylesheet wiring", () => {
  it("imports the token file before anything else", () => {
    const firstImport = /@import\s+"([^"]+)"/.exec(stylesheet);
    expect(firstImport?.[1]).toBe("tokens.scss");
  });

  it("gives .app a default text colour so nothing inherits the antd reset", () => {
    const appBlock = /\n\.app \{([\s\S]*?)\n\}/.exec(stylesheet);
    expect(appBlock?.[1]).toMatch(/color:\s*var\(--text\);/);
  });
});

describe("focus states", () => {
  it("defines a single :focus-visible ring driven by the accent token", () => {
    // Strip // comments before counting so a stray mention in prose can't
    // inflate the match count (this already forced a comment reword once).
    const withoutComments = stylesheet.replace(/\/\/.*$/gm, "");
    // Filter out :focus-visible when it appears in :not(:focus-visible), which
    // guards the outline reset from killing the ring.
    const regex = /:focus-visible/g;
    const matches = [...withoutComments.matchAll(regex)];
    const mainRingOnly = matches.filter((m) => {
      const start = m.index;
      const prefix = withoutComments.substring(Math.max(0, start - 5), start);
      return !prefix.endsWith(':not(');
    });
    expect(mainRingOnly).toHaveLength(1);
    expect(stylesheet).toMatch(/outline:\s*2px solid var\(--accent\);/);
  });
});

describe("theme accents", () => {
  const themeBlocks = Object.fromEntries(
    [...source.matchAll(/\.app\.([\w-]+)\s*\{\s*--accent:\s*([^;]+);/g)]
      .map((m) => [m[1], m[2].trim()]),
  );

  it("defines a class for every theme in themes.js and no others", () => {
    expect(Object.keys(themeBlocks).sort()).toEqual(Object.keys(themes).sort());
  });

  it.each(Object.keys(themes))("%s matches the swatch value in themes.js", (name) => {
    expect(themeBlocks[name]).toBe(themes[name]);
  });

  it.each(Object.keys(themes))("%s meets WCAG AA against --bg", (name) => {
    expect(contrast(themes[name], tokens["--bg"])).toBeGreaterThanOrEqual(4.5);
  });
});

const mixins = readFileSync(
  fileURLToPath(new URL("./mixins.scss", import.meta.url)),
  "utf8",
);

describe("focus ring is not suppressed", () => {
  it.each([
    ["style.scss", stylesheet],
    ["mixins.scss", mixins],
  ])("every outline reset in %s spares :focus-visible", (_name, source) => {
    const unguarded = [...source.matchAll(/([^\n]*)\n[^\n]*outline:\s*none\s*!important/g)]
      .filter((m) => !m[0].includes(":not(:focus-visible)"));
    expect(unguarded).toEqual([]);
  });
});

describe("mixins text colour", () => {
  it("no longer carries its own sub-AA grey", () => {
    expect(mixins).not.toContain("#65656d");
    expect(mixins).not.toContain("$colorSecond");
  });
});

describe("theme accent parity across all three sources", () => {
  const fromIncludes = Object.fromEntries(
    [...mixins.matchAll(/@include\s+styleCreator\(\s*"([\w-]+)"\s*,\s*(#[0-9a-fA-F]{6})/g)]
      .map((m) => [m[1], m[2].toLowerCase()]),
  );

  it("mixins.scss declares one @include per theme", () => {
    expect(Object.keys(fromIncludes).sort()).toEqual(Object.keys(themes).sort());
  });

  it.each(Object.keys(themes))("%s agrees in themes.js and mixins.scss", (name) => {
    expect(fromIncludes[name]).toBe(themes[name].toLowerCase());
  });
});
