const { test } = require("node:test");
const assert = require("node:assert/strict");
const { encodePositions, decodePositions } = require("./positions");

const EMPTY = { t: [], x: [], y: [], h: [], f: [] };

// Delta decoding sums its way back to each coordinate, so an input of -0 returns
// as +0. The two are ===, and JSON cannot carry -0 anyway, so the expectation
// normalises the sign of zero rather than the value.
const zeroSafe = (v) => v + 0;

// An independent restatement of the wire contract: sort by t, keep the first of
// each duplicate t, carry x/y through untouched, clamp health, pack the flags.
function expected(samples) {
  const seen = new Set();
  const out = [];
  const stable = samples
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.t - b.s.t || a.i - b.i);
  for (const { s } of stable) {
    if (seen.has(s.t)) continue;
    seen.add(s.t);
    const health = typeof s.health === "number" && Number.isFinite(s.health) ? s.health : 100;
    out.push({
      t: s.t,
      x: zeroSafe(s.x),
      y: zeroSafe(s.y),
      h: Math.min(100, Math.max(0, Math.round(health))),
      f: (s.isInVehicle ? 1 : 0) | (s.isDBNO ? 2 : 0),
    });
  }
  return out;
}

// Coordinates are integer metres everywhere below: that is what readXY
// (Math.round(cm / 100)) hands the encoder in getMatchReplay.js.
const single = [{ t: 7, x: 123456, y: -9876, health: 55.4, isInVehicle: true, isDBNO: false }];

const long = Array.from({ length: 2000 }, (_, i) => ({
  t: i * 10,
  x: 100000 + i * 37,
  y: 800000 - i * 11,
  health: 100 - i / 40,
  isInVehicle: i % 3 === 0,
  isDBNO: i % 7 === 0,
}));

const negative = [
  { t: 0, x: -1234, y: -99999, health: 100, isInVehicle: false, isDBNO: false },
  { t: 12, x: -5, y: 5, health: 42, isInVehicle: true, isDBNO: true },
  { t: 24, x: -800000, y: -12, health: 1, isInVehicle: false, isDBNO: true },
];

// Out of order, and t=10 appears twice with different coordinates so that
// "keep the FIRST occurrence" is observable.
const unsorted = [
  { t: 30, x: 3000, y: 3000, health: 30, isInVehicle: false, isDBNO: false },
  { t: 10, x: 1000, y: 1000, health: 10, isInVehicle: true, isDBNO: false },
  { t: 10, x: 9999, y: 9999, health: 99, isInVehicle: false, isDBNO: true },
  { t: 20, x: 2000, y: 2000, health: 20, isInVehicle: false, isDBNO: true },
  { t: 5, x: 500, y: 500, health: 5, isInVehicle: true, isDBNO: true },
];

test("round-trips every sample set through the encoded wire shape", () => {
  for (const [label, input] of [
    ["empty", []],
    ["single", single],
    ["2000 samples", long],
    ["negative coordinates", negative],
    ["unsorted with a duplicate t", unsorted],
  ]) {
    assert.deepEqual(decodePositions(encodePositions(input)), expected(input), label);
  }
});

test("the duplicate t keeps the first occurrence, not the last", () => {
  const decoded = decodePositions(encodePositions(unsorted));
  assert.deepEqual(
    decoded.map((p) => p.t),
    [5, 10, 20, 30],
  );
  const dup = decoded.find((p) => p.t === 10);
  assert.equal(dup.x, 1000);
  assert.equal(dup.h, 10);
  assert.equal(dup.f, 1);
});

test("metre coordinates survive the round trip exactly, with no bucketing", () => {
  const metres = Array.from({ length: 500 }, (_, i) => ({
    t: i,
    x: i * 123 - 30000,
    y: 12345 - i * 77,
    health: 100,
    isInVehicle: false,
    isDBNO: false,
  }));
  // Values that a coarser grid would have collapsed or shifted.
  metres.push({ t: 500, x: 5, y: -5, health: 100, isInVehicle: false, isDBNO: false });
  metres.push({ t: 501, x: 1041, y: -1041, health: 100, isInVehicle: false, isDBNO: false });
  metres.push({ t: 502, x: 1042, y: -1042, health: 100, isInVehicle: false, isDBNO: false });
  const decoded = decodePositions(encodePositions(metres));
  assert.equal(decoded.length, metres.length);
  for (let i = 0; i < metres.length; i += 1) {
    assert.equal(decoded[i].x, metres[i].x, `x drift at ${i}`);
    assert.equal(decoded[i].y, metres[i].y, `y drift at ${i}`);
  }
  // Neighbours one metre apart stay one metre apart, not snapped together.
  assert.equal(decoded[502].x - decoded[501].x, 1);
  assert.equal(decoded[502].y - decoded[501].y, -1);
});

test("a fixed 10 s cadence encodes as a constant delta run", () => {
  const cadence = Array.from({ length: 2000 }, (_, i) => ({
    t: 3 + i * 10,
    x: 100000,
    y: 200000,
    health: 100,
    isInVehicle: false,
    isDBNO: false,
  }));
  const encoded = encodePositions(cadence);
  assert.equal(encoded.t.length, 2000);
  assert.equal(encoded.t[0], 3);
  assert.deepEqual(encoded.t.slice(1), new Array(1999).fill(10));
});

test("x and y are first-difference coded in raw metres", () => {
  const encoded = encodePositions([
    { t: 0, x: 1040, y: -1040, health: 100, isInVehicle: false, isDBNO: false },
    { t: 1, x: 1044, y: -1044, health: 100, isInVehicle: false, isDBNO: false },
  ]);
  // Element 0 is absolute metres; element 1 is the true 4 m step, not a scaled one.
  assert.deepEqual(encoded.x, [1040, 4]);
  assert.deepEqual(encoded.y, [-1040, -4]);
  const decoded = decodePositions(encoded);
  assert.deepEqual(decoded.map((p) => p.x), [1040, 1044]);
  assert.deepEqual(decoded.map((p) => p.y), [-1040, -1044]);
});

test("flags pack into a 0..3 bitmask and survive the round trip", () => {
  const combos = [
    { isInVehicle: false, isDBNO: false, f: 0 },
    { isInVehicle: true, isDBNO: false, f: 1 },
    { isInVehicle: false, isDBNO: true, f: 2 },
    { isInVehicle: true, isDBNO: true, f: 3 },
  ];
  const samples = combos.map((c, i) => ({
    t: i,
    x: 1000,
    y: 1000,
    health: 100,
    isInVehicle: c.isInVehicle,
    isDBNO: c.isDBNO,
  }));
  const encoded = encodePositions(samples);
  assert.deepEqual(encoded.f, [0, 1, 2, 3]);
  assert.deepEqual(decodePositions(encoded).map((p) => p.f), [0, 1, 2, 3]);
});

test("health is rounded, clamped and stored absolutely", () => {
  const samples = [
    { t: 0, x: 0, y: 0, health: 150, isInVehicle: false, isDBNO: false },
    { t: 1, x: 0, y: 0, health: -5, isInVehicle: false, isDBNO: false },
    { t: 2, x: 0, y: 0, isInVehicle: false, isDBNO: false },
    { t: 3, x: 0, y: 0, health: 87.6, isInVehicle: false, isDBNO: false },
  ];
  const encoded = encodePositions(samples);
  // Absolute, not delta coded: the raw values appear as-is.
  assert.deepEqual(encoded.h, [100, 0, 100, 88]);
  assert.deepEqual(decodePositions(encoded).map((p) => p.h), [100, 0, 100, 88]);
});

test("empty and missing input never throws", () => {
  assert.deepEqual(encodePositions([]), EMPTY);
  assert.deepEqual(encodePositions(null), EMPTY);
  assert.deepEqual(encodePositions(undefined), EMPTY);
  assert.deepEqual(decodePositions(null), []);
  assert.deepEqual(decodePositions(undefined), []);
  assert.deepEqual(decodePositions({}), []);
  assert.deepEqual(decodePositions(EMPTY), []);
});
