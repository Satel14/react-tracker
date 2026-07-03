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
