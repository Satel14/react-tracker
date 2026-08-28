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

// --- Phase 4 i18n backlog -------------------------------------------------
// Full en<->ua key parity is NOT asserted yet: these keys are still out of
// sync and are deferred to the dedicated Phase 4 i18n task (do not fix here):
//   - pages.player.mini.short   (present in en.json only)
//   - pages.player.mini.shots   (present in ua.json only)
// When Phase 4 reconciles those, replace the menu-scoped assertions below
// with a full-dictionary check:
//   expect([...flattenKeys(ua)].sort()).toEqual([...flattenKeys(en)].sort());
// -------------------------------------------------------------------------

test("both locales define a top-level menu block", () => {
  expect(Object.prototype.hasOwnProperty.call(en, "menu")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(ua, "menu")).toBe(true);
});

test("the menu block exposes identical keys in en and ua", () => {
  const enMenuKeys = [...flattenKeys(en.menu ?? {})].sort();
  const uaMenuKeys = [...flattenKeys(ua.menu ?? {})].sort();
  expect(uaMenuKeys).toEqual(enMenuKeys);
});

test("the weapons block matches across locales and defines no headshot rate label", () => {
  const enWeaponKeys = [...flattenKeys(en.pages?.weapons ?? {})].sort();
  const uaWeaponKeys = [...flattenKeys(ua.pages?.weapons ?? {})].sort();
  expect(uaWeaponKeys).toEqual(enWeaponKeys);
  expect(enWeaponKeys).not.toContain("headshotRate");
  expect(uaWeaponKeys).not.toContain("headshotRate");
});

test("the player matches block exists and matches across locales", () => {
  const enKeys = [...flattenKeys(en.pages?.player?.matches ?? {})].sort();
  const uaKeys = [...flattenKeys(ua.pages?.player?.matches ?? {})].sort();
  expect(enKeys.length).toBeGreaterThan(0);
  expect(uaKeys).toEqual(enKeys);
});

// The replay HUD landed with 22 new keys, and nothing above covered them: the
// full-dictionary check is still deferred, and the three scoped assertions do
// not reach pages.replay. A key added to one locale only would have shipped
// silently. Scope one more block rather than wait for Phase 4.
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
    for (const m of readFileSync(file, "utf8").matchAll(/pages\.replay\.([A-Za-z]+)/g)) used.add(m[1]);
  }
  expect(used.size).toBeGreaterThan(10);
  for (const key of [...used].sort()) {
    expect(en.pages?.replay?.[key], `en is missing pages.replay.${key}`).toBeTruthy();
    expect(ua.pages?.replay?.[key], `ua is missing pages.replay.${key}`).toBeTruthy();
  }
});
