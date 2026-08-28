// Which optional replay overlays the viewer wants drawn, persisted per browser.
//
// Storage discipline is copied from cookie/store.js (which, despite its name,
// also uses localStorage): guard `window`, parse defensively, never let a
// storage failure escape. Two extra hazards apply here that do not apply there:
//
//   1. These helpers are imported by the `logic` Vitest project, which runs in
//      bare Node -- there is no `window` and no `localStorage` at all.
//   2. Real browsers throw on the *property access* itself (Safari private
//      mode, "block site data"), not only on getItem/setItem.
//
// So every entry point degrades to DEFAULT_LAYERS instead of throwing. The
// values feed a requestAnimationFrame draw loop, so a stale key from a future
// version must never survive a read: unknown keys are dropped, not passed on.

// Stable order -- the settings UI renders in this order, and the array is the
// single source of truth for "which keys exist".
export const LAYER_KEYS = Object.freeze([
  "shots",
  "landings",
  "flight",
  "packages",
  "specialZones",
  "healthArcs",
]);

// Shot lines are the densest layer (443-737 per match) and read as clutter on a
// first view, so they start hidden. The rest are sparse point marks.
export const DEFAULT_LAYERS = Object.freeze({
  shots: false,
  landings: true,
  flight: true,
  packages: true,
  specialZones: true,
  healthArcs: true,
});

// Bare and unprefixed, matching the existing keys ("history", "favorites",
// "recent", "theme", "lang").
const STORAGE_KEY = "replayLayers";

function getLocalStorage() {
  try {
    if (typeof window === "undefined" || !window) return null;
    const storage = window.localStorage;
    if (!storage) return null;
    if (typeof storage.getItem !== "function" || typeof storage.setItem !== "function") return null;
    return storage;
  } catch (_e) {
    return null;
  }
}

function readRaw() {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    return typeof raw === "string" ? raw : null;
  } catch (_e) {
    return null;
  }
}

function writeRaw(raw) {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, raw);
  } catch (_e) {
    // Quota, private mode, blocked site data: the in-memory value the caller
    // gets back is still correct, it just will not survive a reload.
  }
}

function parseObject(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_e) {
    return null;
  }
}

// Non-booleans are REJECTED, not coerced. Coercion would read a stored "false"
// string (an easy shape for a future writer to produce) as truthy and switch a
// layer the viewer had turned off back on; falling back to the default is the
// predictable failure. Always builds a new object, never returns DEFAULT_LAYERS
// itself -- a caller mutating a shared default would poison every later read.
function normalize(source) {
  const input = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const out = {};

  for (const key of LAYER_KEYS) {
    const value = input[key];
    out[key] = typeof value === "boolean" ? value : DEFAULT_LAYERS[key];
  }

  return out;
}

export function readLayerPrefs() {
  return normalize(parseObject(readRaw()));
}

export function writeLayerPrefs(prefs) {
  const next = normalize(prefs);

  try {
    writeRaw(JSON.stringify(next));
  } catch (_e) {
    // JSON.stringify cannot realistically throw on a flat boolean map, but the
    // contract is that this function never throws at the caller.
  }

  return next;
}
