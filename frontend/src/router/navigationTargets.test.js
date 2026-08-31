import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// react-router 6 has no patched release for GHSA-wrjc-x8rr-h8h6 ("open redirect
// via backslash in <Link> and useNavigate"): the advisory covers 6.0.0 - 7.17.0
// and the fix ships in 7.18.3, a major upgrade. We stay on 6 because the bug is
// unreachable here -- it needs a navigation target whose FIRST characters come
// from the user, so that "\\evil.com" survives to the router and is read as the
// protocol-relative "//evil.com". Every target in this app is rooted in a
// literal "/" written in the source, and an interpolated segment after that
// root cannot move the string's start.
//
// That is a property of our code, not of the library, so it is the thing worth
// pinning. The day someone writes navigate(params.get("next")) this fails and
// the upgrade decision gets re-made, instead of the reasoning quietly rotting.
//
// Resolve with path.join, never string concatenation -- fileURLToPath's
// trailing separator is platform-dependent and this repo is developed on
// Windows.
const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(SRC, file), "utf8");

// Test files are excluded because they are not shipped.
const files = globSync("**/*.{jsx,js}", { cwd: SRC })
  .filter((f) => !/\.test\.(js|jsx)$/.test(f))
  .map((f) => f.split("\\").join("/"))
  .sort();

// Targets that are a bare identifier cannot be judged from the call site, so
// each one is reviewed by hand and recorded here with what was checked. An
// entry that stops matching fails the test below just as loudly as a new
// unreviewed target does: the list must not outlive the code it describes.
const REVIEWED = [
  {
    file: "component/Navbar.jsx",
    target: "path",
    why: 'Built one line above as item.key === "main" ? "/" : `/${item.key}`, over a hard-coded menu array.',
  },
  {
    file: "pages/Main.jsx",
    target: "url",
    why: 'Both branches are "/player/" + platform + "/" + name; the search box only ever fills the last segment.',
  },
  {
    file: "component/match/KillFeed.jsx",
    target: "to",
    why: 'Held from profilePath(), which returns either null or `/player/${shard}/...`, and the link renders only when it is not null.',
  },
  {
    file: "component/match/MatchScoreboard.jsx",
    target: "to",
    why: 'profileLink.js builds every path it returns from the literal "/player/" root, and returns null rather than a path it cannot root; the link renders only when it is not null.',
  },
  {
    file: "pages/MatchReplayPage.jsx",
    target: "backTo",
    why: 'Ternary over `/player/${platform}/${encodeURIComponent(...)}` and "/", so both branches are literal-rooted.',
  },
];

// Reads the balanced run that starts at `open` and returns its inside. Quotes
// and template literals are skipped whole, so a bracket inside a string -- a
// "/compare?a)b" or a `${x ? "(" : ")"}` -- does not close the run early.
const balanced = (text, start, open, close) => {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
};

// The first top-level argument of a call: navigate(url, { replace: true })
// is about `url`, and the options object never reaches the history stack.
const firstArgument = (args) => {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) depth -= 1;
    else if (c === "," && depth === 0) return args.slice(0, i);
  }
  return args;
};

const targetsIn = (source) => {
  const found = [];

  for (const m of source.matchAll(/\bnavigate\(/g)) {
    const inside = balanced(source, m.index + m[0].length - 1, "(", ")");
    if (inside !== null) found.push(firstArgument(inside).trim());
  }

  // `to` on a Link/NavLink, in both of its spellings.
  for (const m of source.matchAll(/\bto=\{/g)) {
    const inside = balanced(source, m.index + m[0].length - 1, "{", "}");
    if (inside !== null) found.push(inside.trim());
  }
  for (const m of source.matchAll(/\bto="([^"]*)"/g)) found.push(`"${m[1]}"`);

  return found;
};

// Rooted in a literal "/" written here in the source -- the one shape the
// backslash bypass cannot reach, whatever gets interpolated further along.
const isLiteralRooted = (target) => /^["'`]\//.test(target);
// navigate(-1) walks the history stack and takes no URL at all.
const isHistoryStep = (target) => /^-?\d+$/.test(target);
const isBareIdentifier = (target) => /^[A-Za-z_$][\w$]*$/.test(target);

const scanned = files.flatMap((file) => targetsIn(read(file)).map((target) => ({ file, target })));

describe("navigation targets", () => {
  it("finds the navigations it is meant to be guarding", () => {
    // A scanner that silently matched nothing would pass every assertion below
    // while checking nothing at all.
    expect(scanned.length).toBeGreaterThan(15);
  });

  it("is never handed a target the user could root", () => {
    const unrooted = scanned.filter(
      ({ file, target }) =>
        !isLiteralRooted(target) &&
        !isHistoryStep(target) &&
        !REVIEWED.some((r) => r.file === file && r.target === target)
    );

    expect(
      unrooted.map(({ file, target }) => `${file}: ${target}`),
      "each of these must start from a literal \"/\", or be reviewed and added to REVIEWED with why"
    ).toEqual([]);
  });

  it("only defers to a review for a target it cannot read itself", () => {
    // A literal-rooted target needs no review, and an expression that is not a
    // plain identifier cannot be vouched for by name.
    for (const { file, target, why } of REVIEWED) {
      expect(isBareIdentifier(target), `${file}: ${target} is not a bare identifier`).toBe(true);
      expect(why.length, `${file}: ${target} has no reason recorded`).toBeGreaterThan(20);
    }
  });

  it("keeps no review for a navigation that is gone", () => {
    const stale = REVIEWED.filter(
      (r) => !scanned.some(({ file, target }) => file === r.file && target === r.target)
    );

    expect(
      stale.map((r) => `${r.file}: ${r.target}`),
      "these reviewed targets no longer exist -- delete the entries"
    ).toEqual([]);
  });
});
