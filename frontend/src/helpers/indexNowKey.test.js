import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
const keyFiles = readdirSync(publicDir).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
const routes = JSON.parse(readFileSync(`${publicDir}_routes.json`, "utf8"));

// tier-census.yml finds the IndexNow key by this file's name, and IndexNow
// accepts a ping only when the file at keyLocation holds exactly that key. A
// renamed or edited file still deploys fine; every ping after it is refused.
describe("IndexNow key file", () => {
  it("is the only key-shaped file, so the workflow cannot pick the wrong one", () => {
    expect(keyFiles).toHaveLength(1);
  });

  it("holds exactly the key its name carries", () => {
    const [file] = keyFiles;
    expect(readFileSync(`${publicDir}${file}`, "utf8")).toBe(file.replace(/\.txt$/, ""));
  });

  // Served as the static file, like the Google and Bing verification files,
  // rather than through the Pages Function.
  it("is excluded from the Pages Function", () => {
    expect(routes.exclude).toContain(`/${keyFiles[0]}`);
  });
});
