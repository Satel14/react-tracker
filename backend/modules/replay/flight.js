const { readXY } = require("../telemetryUtils");

const AIRCRAFT_ID = "DummyTransportAircraft_C";

// The plane path is an exact straight line and its exits report a constant
// altitude, so the first and last exit fully describe it -- no fit, no average.
// Coordinates leave here as whole metres, matching the rest of the replay payload.
function exitPoint(ev) {
  const loc = ev?.vehicle?.location;
  const fromVehicle = readXY(loc);
  if (fromVehicle && (Number(loc.x) !== 0 || Number(loc.y) !== 0)) return fromVehicle;
  return readXY(ev?.character?.location);
}

function extractFlight(telemetry, clock) {
  const events = Array.isArray(telemetry) ? telemetry : [];
  const timeOf = typeof clock?.timeOf === "function" ? clock.timeOf.bind(clock) : () => null;

  let first = null;
  let last = null;
  let count = 0;

  for (const ev of events) {
    if (ev?._T !== "LogVehicleLeave") continue;
    if (ev?.vehicle?.vehicleId !== AIRCRAFT_ID) continue;
    const point = exitPoint(ev);
    if (!point) continue;
    const t = timeOf(ev);
    if (typeof t !== "number" || !Number.isFinite(t)) continue;

    last = { x: point.x, y: point.y, t, velocity: Number(ev.vehicle.velocity) };
    if (!first) first = last;
    count += 1;
  }

  if (count < 2) return null;

  return {
    x1: first.x,
    y1: first.y,
    t1: first.t,
    x2: last.x,
    y2: last.y,
    t2: last.t,
    speed: Number.isFinite(first.velocity) ? Math.round(first.velocity / 100) : 0,
  };
}

module.exports = { extractFlight };
