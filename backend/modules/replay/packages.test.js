const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractPackages } = require("./packages");

// The stub mirrors the real clock closely enough to be discriminating: a top-level
// elapsedTime wins, anything else is an unreadable time.
const clock = {
  timeOf: (ev) => (Number.isFinite(ev?.elapsedTime) ? ev.elapsedTime : null),
};

// Telemetry locations are centimetres; the replay payload is metres.
const cm = (metres) => metres * 100;

function pkg(id, x, y, items) {
  const p = { itemPackageId: id, location: { x, y, z: 100 } };
  if (items !== undefined) p.items = items;
  return p;
}

const land = (id, x, y, t, items) => ({
  _T: "LogCarePackageLand",
  elapsedTime: t,
  itemPackage: pkg(id, x, y, items),
});

const spawn = (id, x, y, t, items) => ({
  _T: "LogCarePackageSpawn",
  elapsedTime: t,
  itemPackage: pkg(id, x, y, items),
});

// Every id below was observed in real match telemetry. Note PUBG ships the typo
// "Carapackage_" on most ids but the correct "Carepackage_" on the Bluechip one.
const KIND_TABLE = [
  ["Carapackage_RedBox_C", "redbox"],
  ["Carapackage_SmallPackage_C", "small"],
  ["Carapackage_SmallPackage_NoParachute_C", "small"],
  ["Carapackage_FlareGun_C", "flare"],
  ["Carepackage_SmallPackage_NoParachute_Bluechip_C", "bluechip"],
  ["BP_BRDM_C", "brdm"],
  ["Carapackage_TotallyUnknown_C", "small"],
];

test("maps every observed itemPackageId to its kind", () => {
  for (const [id, kind] of KIND_TABLE) {
    const out = extractPackages([land(id, cm(100), cm(200), 60)], clock);
    assert.equal(out.length, 1, id);
    assert.equal(out[0].kind, kind, id);
    assert.equal(out[0].id, id, "id is passed through raw");
  }
});

test("the Bluechip id is bluechip and not small despite containing SmallPackage", () => {
  const id = "Carepackage_SmallPackage_NoParachute_Bluechip_C";
  const [entry] = extractPackages([land(id, cm(10), cm(20), 5)], clock);
  assert.equal(entry.kind, "bluechip");
  assert.notEqual(entry.kind, "small");
});

test("matches ids case-insensitively across both spellings of the prefix", () => {
  const cases = [
    ["carapackage_redbox_c", "redbox"],
    ["CAREPACKAGE_REDBOX_C", "redbox"],
    ["carepackage_flaregun_c", "flare"],
    ["bp_brdm_c", "brdm"],
    ["carapackage_smallpackage_noparachute_bluechip_c", "bluechip"],
  ];
  for (const [id, kind] of cases) {
    const [entry] = extractPackages([land(id, cm(1), cm(2), 1)], clock);
    assert.equal(entry.kind, kind, id);
  }
});

test("a land paired with a spawn carries the spawn time; an unpaired land has ts null", () => {
  const id = "Carapackage_RedBox_C";
  const out = extractPackages(
    [
      spawn(id, cm(500), cm(600), 120),
      land(id, cm(500), cm(600), 168),
      land(id, cm(900), cm(900), 300),
    ],
    clock,
  );
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((p) => [p.t, p.ts]),
    [
      [168, 120],
      [300, null],
    ],
  );
});

test("the spawn join keys on the raw position, so sub-metre neighbours never collide", () => {
  const id = "Carapackage_RedBox_C";
  // Both packages round to the same metre cell (1000, 2000) on output, so a
  // metre-rounded join key would merge them. The lands are deliberately ordered
  // opposite to the spawns: a collapsed key would hand each land the other's ts.
  const out = extractPackages(
    [
      spawn(id, 100000, 200000, 10),
      spawn(id, 100049, 200049, 20),
      land(id, 100049, 200049, 60),
      land(id, 100000, 200000, 70),
    ],
    clock,
  );
  assert.deepEqual(
    out.map((p) => [p.t, p.ts, p.x, p.y]),
    [
      [60, 20, 1000, 2000],
      [70, 10, 1000, 2000],
    ],
  );
});

test("a spawn one centimetre off the land does not pair", () => {
  const id = "Carapackage_RedBox_C";
  const out = extractPackages([spawn(id, 100001, 200000, 30), land(id, 100000, 200000, 90)], clock);
  assert.equal(out.length, 1);
  assert.equal(out[0].ts, null);
});

test("a spawn with no land produces no entry", () => {
  const out = extractPackages(
    [
      spawn("Carapackage_RedBox_C", cm(500), cm(600), 120),
      spawn("Carapackage_FlareGun_C", cm(100), cm(100), 130),
    ],
    clock,
  );
  assert.deepEqual(out, []);
});

test("two packages at different positions do not cross-match", () => {
  const a = "Carapackage_RedBox_C";
  const b = "Carapackage_FlareGun_C";
  const out = extractPackages(
    [
      spawn(a, cm(100), cm(100), 10),
      spawn(b, cm(800), cm(800), 20),
      land(a, cm(100), cm(100), 60),
      land(b, cm(800), cm(800), 70),
    ],
    clock,
  );
  assert.deepEqual(
    out.map((p) => [p.kind, p.x, p.y, p.t, p.ts]),
    [
      ["redbox", 100, 100, 60, 10],
      ["flare", 800, 800, 70, 20],
    ],
  );
});

test("a land does not borrow the ts of a same-position spawn with a different id", () => {
  const out = extractPackages(
    [
      spawn("Carapackage_RedBox_C", cm(400), cm(400), 15),
      land("Carapackage_FlareGun_C", cm(400), cm(400), 80),
    ],
    clock,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].ts, null);
});

test("a land does not borrow the ts of a same-id spawn at another position", () => {
  const id = "Carapackage_RedBox_C";
  const out = extractPackages([spawn(id, cm(100), cm(100), 15), land(id, cm(700), cm(700), 80)], clock);
  assert.equal(out.length, 1);
  assert.equal(out[0].ts, null);
});

test("n counts the items and a missing items array yields 0", () => {
  const id = "Carapackage_RedBox_C";
  const three = extractPackages([land(id, cm(10), cm(10), 10, [{}, {}, {}])], clock);
  assert.equal(three[0].n, 3);
  const empty = extractPackages([land(id, cm(10), cm(10), 10, [])], clock);
  assert.equal(empty[0].n, 0);
  const missing = extractPackages([land(id, cm(10), cm(10), 10)], clock);
  assert.equal(missing[0].n, 0);
  const notAnArray = extractPackages([land(id, cm(10), cm(10), 10, "loot")], clock);
  assert.equal(notAnArray[0].n, 0);
});

test("skips a land with no readable location or no clock time", () => {
  const id = "Carapackage_RedBox_C";
  const noLocation = { _T: "LogCarePackageLand", elapsedTime: 10, itemPackage: { itemPackageId: id } };
  const nanLocation = {
    _T: "LogCarePackageLand",
    elapsedTime: 10,
    itemPackage: { itemPackageId: id, location: { x: "nope", y: null } },
  };
  // No elapsedTime, so the stubbed clock returns null.
  const noTime = { _T: "LogCarePackageLand", itemPackage: pkg(id, cm(10), cm(10)) };
  assert.deepEqual(extractPackages([noLocation, nanLocation, noTime], clock), []);
});

test("does not throw on malformed input and returns entries sorted by t", () => {
  const id = "Carapackage_RedBox_C";
  assert.deepEqual(extractPackages(null, clock), []);
  assert.deepEqual(extractPackages(undefined, clock), []);
  assert.deepEqual(extractPackages([], clock), []);
  assert.deepEqual(extractPackages("not telemetry", clock), []);

  const out = extractPackages(
    [
      null,
      "garbage",
      { _T: "LogCarePackageLand" },
      { _T: "LogCarePackageLand", elapsedTime: 5, itemPackage: null },
      { _T: "LogCarePackageSpawn", itemPackage: null },
      { _T: "LogPlayerPosition", elapsedTime: 1 },
      land(id, cm(300), cm(300), 240),
      land(id, cm(100), cm(100), 30),
      land(id, cm(200), cm(200), 120),
    ],
    clock,
  );
  assert.deepEqual(
    out.map((p) => p.t),
    [30, 120, 240],
  );
});

test("rounds the land location to whole metres", () => {
  const [entry] = extractPackages([land("Carapackage_RedBox_C", 123456, -654321, 42)], clock);
  assert.equal(entry.x, 1235);
  assert.equal(entry.y, -6543);
});

test("emits metres, not the raw centimetres of the telemetry", () => {
  // A real Erangel drop location. Emitting centimetres would put the marker 100x off-map.
  const [entry] = extractPackages(
    [land("Carapackage_RedBox_C", 358636.625, 118309.3359375, 300)],
    clock,
  );
  assert.equal(entry.x, 3586);
  assert.equal(entry.y, 1183);
});

test("emits exactly the documented shape", () => {
  const id = "Carepackage_SmallPackage_NoParachute_Bluechip_C";
  const out = extractPackages(
    [spawn(id, cm(250), cm(350), 44), land(id, cm(250), cm(350), 96, [{}, {}])],
    clock,
  );
  assert.deepEqual(out, [
    { kind: "bluechip", id, t: 96, ts: 44, x: 250, y: 350, n: 2 },
  ]);
});
