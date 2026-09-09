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

// One stat, one word. The knock count is shown in four places -- the stat card,
// the match card, the lobby scoreboard and the weapons tab -- and it used to
// carry three different names: "Knockouts", "DBNOs" and "DBNO". DBNO is the
// API's term, not the game's.
test("the knock count is named the same wherever it appears", () => {
  const pageSrc = readFileSync(
    join(fileURLToPath(new URL("../pages", import.meta.url)), "PlayerPage.jsx"),
    "utf8"
  );

  expect(en.pages.match.colKnocks).toBe("Knocks");
  expect(en.pages.weapons.knocks).toBe("Knocks");
  expect(ua.pages.match.colKnocks).toBe(ua.pages.weapons.knocks);

  // The two labels on the player page are hard-coded English, like every other
  // label in those grids, so the guard has to read the source.
  expect(pageSrc).toContain('{ key: "dbnos", label: "Knocks"');
  expect(pageSrc).toContain("<span>Knocks</span>");
  expect(pageSrc).not.toMatch(/DBNOs?<|label: "Knockouts"/);
});
