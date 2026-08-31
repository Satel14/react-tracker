import { LAYER_KEYS, DEFAULT_LAYERS, readLayerPrefs, writeLayerPrefs } from "./replayPrefs";

// One key, bare and unprefixed -- the same flat namespace the rest of the app
// already writes ("history", "favorites", "recent", "theme", "lang").
const STORAGE_KEY = "replayLayers";

const EXPECTED_DEFAULTS = {
  shots: false,
  landings: true,
  flight: true,
  packages: true,
  specialZones: true,
  healthArcs: true,
  damage: true,
};

// The logic project runs in bare Node: no `window`, no `localStorage`. Tests
// that need a store install one for their own duration only, so the "no storage
// at all" test below observes the genuine article rather than a leftover stub.
const installStorage = (overrides) => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    ...overrides,
  };
  globalThis.window = { localStorage: storage };
  return storage;
};

afterEach(() => {
  delete globalThis.window;
});

// ------------------------------------------------------------------ defaults

test("shot lines default off and every other layer defaults on", () => {
  expect(DEFAULT_LAYERS).toEqual(EXPECTED_DEFAULTS);
  expect(DEFAULT_LAYERS.shots).toBe(false);
  expect(Object.keys(DEFAULT_LAYERS)).toHaveLength(7);
});

test("LAYER_KEYS lists the seven layers in a stable order", () => {
  expect(LAYER_KEYS).toEqual([
    "shots",
    "landings",
    "flight",
    "packages",
    "specialZones",
    "healthArcs",
    "damage",
  ]);
});

test("an empty store reads back the defaults, all seven keys", () => {
  installStorage();
  const prefs = readLayerPrefs();
  expect(prefs).toEqual(EXPECTED_DEFAULTS);
  expect(Object.keys(prefs).sort()).toEqual([...LAYER_KEYS].sort());
});

// ---------------------------------------------------------------- round trip

test("write then read preserves every value", () => {
  installStorage();
  const wanted = {
    shots: true,
    landings: false,
    flight: true,
    packages: false,
    specialZones: false,
    healthArcs: true,
  damage: true,
  };
  expect(writeLayerPrefs(wanted)).toEqual(wanted);
  expect(readLayerPrefs()).toEqual(wanted);
});

test("writeLayerPrefs returns the normalised object it stored", () => {
  const storage = installStorage();
  const stored = writeLayerPrefs({ shots: true, bogus: 1, landings: "nope" });
  expect(stored).toEqual({ ...EXPECTED_DEFAULTS, shots: true });
  expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual(stored);
  // Unknown keys never reach storage either, or every later read would have to
  // strip the same stale key again.
  expect(Object.keys(JSON.parse(storage.getItem(STORAGE_KEY))).sort()).toEqual(
    [...LAYER_KEYS].sort()
  );
});

// ------------------------------------------------------------ corrupt values

const CORRUPT = [
  ["invalid JSON", '{"shots": tru'],
  ["a truncated object", "{"],
  ["an empty string", ""],
  ["a bare string", '"hello"'],
  ["a number", "42"],
  ["an array", "[]"],
  ["null", "null"],
  ["a JSON boolean", "true"],
];

for (const [label, raw] of CORRUPT) {
  test("a stored value that is " + label + " falls back to the defaults without throwing", () => {
    const storage = installStorage();
    storage.setItem(STORAGE_KEY, raw);
    expect(() => readLayerPrefs()).not.toThrow();
    expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);
  });
}

// ------------------------------------------------------------- shape repairs

test("unknown keys in storage are dropped from the result", () => {
  const storage = installStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...EXPECTED_DEFAULTS, shots: true, redZone: true, carePackages: true })
  );

  const prefs = readLayerPrefs();
  expect(prefs).not.toHaveProperty("redZone");
  expect(prefs).not.toHaveProperty("carePackages");
  expect(Object.keys(prefs).sort()).toEqual([...LAYER_KEYS].sort());
  expect(prefs.shots).toBe(true);
});

test("a partial object is completed from the defaults", () => {
  const storage = installStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ shots: true }));

  expect(readLayerPrefs()).toEqual({ ...EXPECTED_DEFAULTS, shots: true });
});

// Non-boolean values are REJECTED, not coerced: a stored "false" string would
// coerce truthy and silently switch back on a layer the viewer had turned off.
test("non-boolean values are rejected and fall back to that key's default", () => {
  const storage = installStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      shots: "true",
      landings: 0,
      flight: null,
      packages: "false",
      specialZones: [],
      healthArcs: 1,
    })
  );

  expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);
});

// ----------------------------------------------------------------- freshness

test("readLayerPrefs returns a fresh object each call", () => {
  installStorage();

  const first = readLayerPrefs();
  expect(first).not.toBe(DEFAULT_LAYERS);

  first.shots = true;
  first.landings = false;

  const second = readLayerPrefs();
  expect(second).not.toBe(first);
  expect(second).toEqual(EXPECTED_DEFAULTS);
  expect(DEFAULT_LAYERS).toEqual(EXPECTED_DEFAULTS);
});

test("writeLayerPrefs hands back an object the caller may mutate freely", () => {
  installStorage();

  const stored = writeLayerPrefs({ shots: true });
  expect(stored).not.toBe(DEFAULT_LAYERS);
  stored.shots = false;

  expect(readLayerPrefs().shots).toBe(true);
  expect(DEFAULT_LAYERS).toEqual(EXPECTED_DEFAULTS);
});

// ------------------------------------------------------------- hostile hosts

test("no localStorage global at all degrades to the defaults", () => {
  // The genuine logic-project condition -- nothing is stubbed in for this one.
  expect(typeof window).toBe("undefined");
  expect(typeof localStorage).toBe("undefined");

  expect(() => readLayerPrefs()).not.toThrow();
  expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);

  expect(() => writeLayerPrefs({ shots: true })).not.toThrow();
  expect(writeLayerPrefs({ shots: true })).toEqual({ ...EXPECTED_DEFAULTS, shots: true });
});

test("a localStorage whose getItem and setItem throw degrades to the defaults", () => {
  installStorage({
    getItem: () => {
      throw new Error("The operation is insecure.");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  });

  expect(() => readLayerPrefs()).not.toThrow();
  expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);

  expect(() => writeLayerPrefs({ shots: true })).not.toThrow();
  expect(writeLayerPrefs({ shots: true })).toEqual({ ...EXPECTED_DEFAULTS, shots: true });
});

test("a window whose localStorage getter throws degrades to the defaults", () => {
  globalThis.window = {
    get localStorage() {
      throw new Error("Access to storage is denied for this document.");
    },
  };

  expect(() => readLayerPrefs()).not.toThrow();
  expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);
  expect(() => writeLayerPrefs({ shots: true })).not.toThrow();
});

test("a non-functional localStorage degrades to the defaults", () => {
  globalThis.window = { localStorage: {} };

  expect(() => readLayerPrefs()).not.toThrow();
  expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);
  expect(() => writeLayerPrefs({ shots: true })).not.toThrow();
  expect(writeLayerPrefs({ shots: true })).toEqual({ ...EXPECTED_DEFAULTS, shots: true });
});

// --------------------------------------------------------------- write input

test("writeLayerPrefs normalises a garbage argument to the defaults", () => {
  installStorage();

  for (const bad of [undefined, null, "hello", 42, [], true]) {
    expect(writeLayerPrefs(bad)).toEqual(EXPECTED_DEFAULTS);
  }
  expect(readLayerPrefs()).toEqual(EXPECTED_DEFAULTS);
});
