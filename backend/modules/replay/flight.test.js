const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractFlight } = require("./flight");

// The stub clock the brief prescribes: an event carries its own in-game time.
const clock = { timeOf: (ev) => ev.__t ?? null };

// A cargo-plane exit. Telemetry positions and velocities are centimetres; the
// payload is metres, so every expectation below is the value / 100. z is the
// constant 150000 the real flight path always reports.
const exit = (t, x, y, velocity = 12000) => ({
  _T: "LogVehicleLeave",
  __t: t,
  character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: x + 500, y: y + 500, z: 120000 } },
  vehicle: { vehicleType: "TransportAircraft", vehicleId: "DummyTransportAircraft_C", velocity, location: { x, y, z: 150000 } },
});

const bike = (t, x, y) => ({
  _T: "LogVehicleLeave",
  __t: t,
  character: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x, y, z: 0 } },
  vehicle: { vehicleType: "WheeledVehicle", vehicleId: "BP_Motorbike_04_C", velocity: 900, location: { x, y, z: 0 } },
});

test("takes the first and last exit on the line and the first exit's speed", () => {
  const telemetry = [
    exit(10, 100000, 200000, 12345.6),
    exit(20, 200000, 300000, 999),
    exit(30, 300000, 400000, 111),
  ];
  assert.deepEqual(extractFlight(telemetry, clock), {
    x1: 1000, y1: 2000, t1: 10,
    x2: 3000, y2: 4000, t2: 30,
    speed: 123,
  });
});

test("reports speed in metres per second, not centimetres", () => {
  // Measured across 8 real matches: the plane reports ~14180 cm/s, i.e. a
  // ground speed of ~142 m/s. A raw (unconverted) reading would be 14180.
  const flight = extractFlight([exit(10, 100000, 200000, 14180), exit(30, 300000, 400000)], clock);
  assert.equal(flight.speed, 142);
});

test("does not average the intermediate exits into the endpoints", () => {
  // The middle exit sits off the chord; averaging or fitting would move an endpoint.
  const telemetry = [exit(10, 10000, 10000), exit(11, 90000, 20000), exit(30, 100000, 100000)];
  const flight = extractFlight(telemetry, clock);
  assert.equal(flight.x1, 100);
  assert.equal(flight.y1, 100);
  assert.equal(flight.x2, 1000);
  assert.equal(flight.y2, 1000);
});

test("rounds the endpoint coordinates to whole metres", () => {
  // Centimetre remainders either side of the half-metre.
  const flight = extractFlight([exit(10, 100050, 199949), exit(30, 300051, 399949.6)], clock);
  assert.deepEqual([flight.x1, flight.y1, flight.x2, flight.y2], [1001, 1999, 3001, 3999]);
});

test("uses array order, not time order, to pick the endpoints", () => {
  const telemetry = [exit(30, 100000, 200000), exit(10, 300000, 400000)];
  const flight = extractFlight(telemetry, clock);
  assert.deepEqual([flight.x1, flight.y1, flight.t1], [1000, 2000, 30]);
  assert.deepEqual([flight.x2, flight.y2, flight.t2], [3000, 4000, 10]);
});

test("returns null for a single exit and for no exits at all", () => {
  assert.equal(extractFlight([exit(10, 100000, 200000)], clock), null);
  assert.equal(extractFlight([bike(10, 1, 2), { _T: "LogPlayerPosition", __t: 5 }], clock), null);
});

test("falls back to character.location when vehicle.location is zeroed", () => {
  const zeroed = exit(10, 0, 0);
  zeroed.vehicle.location = { x: 0, y: 0, z: 0 };
  zeroed.character.location = { x: 150000, y: 250000, z: 120000 };
  const flight = extractFlight([zeroed, exit(30, 300000, 400000)], clock);
  assert.deepEqual([flight.x1, flight.y1], [1500, 2500]);
});

test("falls back to character.location when vehicle.location is missing", () => {
  const noLoc = exit(10, 0, 0);
  delete noLoc.vehicle.location;
  noLoc.character.location = { x: 160000, y: 260000, z: 120000 };
  const flight = extractFlight([noLoc, exit(30, 300000, 400000)], clock);
  assert.deepEqual([flight.x1, flight.y1], [1600, 2600]);
});

test("prefers vehicle.location over character.location when it is usable", () => {
  const flight = extractFlight([exit(10, 100000, 200000), exit(30, 300000, 400000)], clock);
  // character.location is offset by +500 cm in the fixture, so a fallback would
  // show up as 1005/2005 rather than 1000/2000.
  assert.deepEqual([flight.x1, flight.y1, flight.x2, flight.y2], [1000, 2000, 3000, 4000]);
});

test("skips an exit whose locations are both unusable", () => {
  const broken = exit(20, 0, 0);
  broken.vehicle.location = { x: 0, y: 0, z: 0 };
  delete broken.character.location;
  const flight = extractFlight([exit(10, 100000, 200000), broken, exit(30, 300000, 400000)], clock);
  assert.deepEqual([flight.x1, flight.x2, flight.t2], [1000, 3000, 30]);
  // The broken exit must not become an endpoint even when it is last in the array.
  assert.equal(extractFlight([exit(10, 100000, 200000), exit(30, 300000, 400000), broken], clock).x2, 3000);
});

test("ignores non-aircraft vehicle exits entirely", () => {
  const telemetry = [
    bike(5, 700000, 700000),
    exit(10, 100000, 200000, 12000),
    exit(30, 300000, 400000, 111),
    bike(40, 800000, 800000),
  ];
  assert.deepEqual(extractFlight(telemetry, clock), {
    x1: 1000, y1: 2000, t1: 10,
    x2: 3000, y2: 4000, t2: 30,
    speed: 120,
  });
  // Two bikes alone are not a flight path.
  assert.equal(extractFlight([bike(5, 700000, 700000), bike(40, 800000, 800000)], clock), null);
});

test("ignores every event type other than LogVehicleLeave", () => {
  const impostor = { ...exit(1, 900000, 900000), _T: "LogVehicleRide" };
  const flight = extractFlight([impostor, exit(10, 100000, 200000), exit(30, 300000, 400000)], clock);
  assert.deepEqual([flight.x1, flight.t1], [1000, 10]);
});

test("skips an exit whose clock time is null and still uses the rest", () => {
  const untimed = exit(10, 900000, 900000);
  delete untimed.__t;
  const telemetry = [untimed, exit(20, 100000, 200000), exit(30, 300000, 400000)];
  assert.deepEqual(extractFlight(telemetry, clock), {
    x1: 1000, y1: 2000, t1: 20,
    x2: 3000, y2: 4000, t2: 30,
    speed: 120,
  });
  // With only one timed exit left there is no line.
  assert.equal(extractFlight([untimed, exit(20, 100000, 200000)], clock), null);
});

test("keeps a t of 0 rather than treating it as missing", () => {
  const flight = extractFlight([exit(0, 100000, 200000), exit(30, 300000, 400000)], clock);
  assert.equal(flight.t1, 0);
});

test("reports speed 0 when the first exit's velocity is not a finite number", () => {
  const noVelocity = exit(10, 100000, 200000);
  delete noVelocity.vehicle.velocity;
  assert.equal(extractFlight([noVelocity, exit(30, 300000, 400000, 111)], clock).speed, 0);

  const nanVelocity = exit(10, 100000, 200000, Number.NaN);
  assert.equal(extractFlight([nanVelocity, exit(30, 300000, 400000, 111)], clock).speed, 0);

  const stringVelocity = exit(10, 100000, 200000, "fast");
  assert.equal(extractFlight([stringVelocity, exit(30, 300000, 400000, 111)], clock).speed, 0);
});

test("takes speed from the first usable exit, not the first aircraft event", () => {
  const untimed = exit(10, 900000, 900000, 55555);
  delete untimed.__t;
  assert.equal(extractFlight([untimed, exit(20, 100000, 200000, 13000), exit(30, 300000, 400000)], clock).speed, 130);
});

test("does not throw on malformed input", () => {
  assert.equal(extractFlight(null, clock), null);
  assert.equal(extractFlight(undefined, clock), null);
  assert.equal(extractFlight([], clock), null);
  assert.equal(extractFlight("not telemetry", clock), null);

  const noVehicle = { _T: "LogVehicleLeave", __t: 10, character: { location: { x: 1, y: 2, z: 3 } } };
  assert.equal(extractFlight([noVehicle], clock), null);
  assert.equal(extractFlight([noVehicle, noVehicle], clock), null);

  const flight = extractFlight(
    [null, undefined, noVehicle, {}, { _T: "LogVehicleLeave" }, exit(10, 100000, 200000), exit(30, 300000, 400000)],
    clock
  );
  assert.deepEqual([flight.x1, flight.x2], [1000, 3000]);
});

test("does not throw when the clock is missing or has no timeOf", () => {
  const telemetry = [exit(10, 100000, 200000), exit(30, 300000, 400000)];
  assert.equal(extractFlight(telemetry, null), null);
  assert.equal(extractFlight(telemetry, {}), null);
});
