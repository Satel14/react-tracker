import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
      "--text-strong", "--win",
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
