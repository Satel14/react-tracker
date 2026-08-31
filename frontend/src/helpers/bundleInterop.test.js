import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
);

const viteConfig = readFileSync(
  fileURLToPath(new URL("../../vite.config.js", import.meta.url)),
  "utf8",
);

describe("commonjs interop", () => {
  // Marking the package as ESM changes which interop helper Rollup emits for a
  // CommonJS dependency. It turned `import CountUp from "react-countup"` into
  // the module namespace object, so the homepage threw React error #130 the
  // moment the live snapshot arrived and <CountUp> rendered -- in production
  // only, because the API sends no CORS headers and a local preview therefore
  // never gets that far. Nothing in a jsdom suite sees the production bundle, so
  // this pins the cause rather than the symptom.
  it("does not mark the package as ESM", () => {
    expect(packageJson.type).toBeUndefined();
  });

  // The reason the field was added in the first place: a `node scripts/*.mjs`
  // step could not import the ESM helpers without it. Vite bundles its own
  // config, so the prerender belongs there and the field stays gone.
  it("prerenders from the vite config, not a separate node process", () => {
    expect(packageJson.scripts.build).toBe("vite build");
    expect(viteConfig).toContain("prerenderHead");
  });
});
