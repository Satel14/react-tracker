import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import en from "./en.json";
import ua from "./ua.json";

// Flatten a nested translation dictionary into a Set of dotted key paths,
// e.g. { menu: { main: "x" } } -> Set { "menu.main" }.
const flattenKeys = (obj, prefix = "") => {
  const keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of flattenKeys(value, path)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
};

test("both locales define a top-level menu block", () => {
  expect(Object.prototype.hasOwnProperty.call(en, "menu")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(ua, "menu")).toBe(true);
});

test("en and ua define identical key sets", () => {
  expect([...flattenKeys(ua)].sort()).toEqual([...flattenKeys(en)].sort());
});

test("the weapons block defines no headshot rate label", () => {
  const enWeaponKeys = [...flattenKeys(en.pages?.weapons ?? {})].sort();
  const uaWeaponKeys = [...flattenKeys(ua.pages?.weapons ?? {})].sort();
  expect(enWeaponKeys).not.toContain("headshotRate");
  expect(uaWeaponKeys).not.toContain("headshotRate");
});

test("the player matches block exists", () => {
  const enKeys = [...flattenKeys(en.pages?.player?.matches ?? {})].sort();
  expect(enKeys.length).toBeGreaterThan(0);
});

test("the replay block matches across locales", () => {
  const enKeys = [...flattenKeys(en.pages?.replay ?? {})].sort();
  const uaKeys = [...flattenKeys(ua.pages?.replay ?? {})].sort();
  expect(enKeys.length).toBeGreaterThan(0);
  expect(uaKeys).toEqual(enKeys);
});

// Every key the replay components actually call has to exist. Deriving the
// list from the source rather than restating it by hand: a hand-written copy
// went stale within the hour when a component renamed three of its keys, and
// the test still passed.
test("every replay key the components reference exists in both locales", () => {
  const dir = fileURLToPath(new URL("../component/charts", import.meta.url));
  const pageDir = fileURLToPath(new URL("../pages", import.meta.url));
  const files = [
    ...readdirSync(dir).filter((f) => f.startsWith("Replay") && f.endsWith(".jsx") && !f.includes(".test.")).map((f) => join(dir, f)),
    join(pageDir, "MatchReplayPage.jsx"),
  ];
  const used = new Set();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/pages\.replay\.([A-Za-z]+)/g)) used.add(m[1]);
    // A key built by template literal -- t(`pages.replay.${LAYER_LABEL[key]}`) --
    // is invisible to the scan above, and the six layer names it hides are the
    // ones most likely to drift. Follow the lookup table to its values.
    for (const table of src.matchAll(/pages\.replay\.\$\{(\w+)\[/g)) {
      const start = src.indexOf(`const ${table[1]} = {`);
      const end = start < 0 ? -1 : src.indexOf("};", start);
      if (start < 0 || end < 0) throw new Error(`cannot resolve the ${table[1]} key table in ${file}`);
      for (const v of src.slice(start, end).matchAll(/:\s*"([A-Za-z]+)"/g)) used.add(v[1]);
    }
  }
  expect(used.size).toBeGreaterThan(10);
  for (const key of [...used].sort()) {
    expect(en.pages?.replay?.[key], `en is missing pages.replay.${key}`).toBeTruthy();
    expect(ua.pages?.replay?.[key], `ua is missing pages.replay.${key}`).toBeTruthy();
  }
});
