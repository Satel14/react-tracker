const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "json", ".git"]);
const REQUIRE_RE = /require\(\s*["']([^"']+)["']\s*\)/g;

function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        collectJsFiles(path.join(dir, entry.name), out);
      }
    } else if (entry.name.endsWith(".js")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

test("every static require() in the backend resolves", () => {
  const failures = [];
  for (const file of collectJsFiles(BACKEND_ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(REQUIRE_RE)) {
      const spec = match[1];
      if (spec.startsWith("node:")) continue;
      try {
        require.resolve(spec, { paths: [path.dirname(file)] });
      } catch {
        failures.push(`${path.relative(BACKEND_ROOT, file)} -> ${spec}`);
      }
    }
  }
  assert.deepStrictEqual(
    failures,
    [],
    `unresolvable requires:\n${failures.join("\n")}`
  );
});
