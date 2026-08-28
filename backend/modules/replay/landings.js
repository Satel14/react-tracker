// Where each player touched down.
//
// Players land 1-5 times per match (Taego's Comeback BR, redeploy towers), so
// ~62 players emit ~80 landing events. Only the first drop is a landing spot;
// the rest are re-entries. The stream is not ordered, so "first" is the
// smallest clock time, never the first index in the array.

const { readXY } = require("../telemetryUtils");

const LANDING = "LogParachuteLanding";

function extractLandings(telemetry, clock) {
  const firstByAccount = new Map();

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== LANDING) continue;

    const a = ev.character?.accountId;
    if (!a) continue;

    // Centimetres in, integer metres out - the scale every consumer expects.
    const xy = readXY(ev.character?.location);
    if (!xy) continue;

    const t = clock.timeOf(ev);
    if (!Number.isFinite(t)) continue;

    const previous = firstByAccount.get(a);
    if (previous && previous.t <= t) continue;

    // LogParachuteLanding.distance is already in metres (16.6-1318.6 across a
    // real match), so it is not divided by 100 the way knocks.js divides its own.
    const distance = Number.isFinite(ev.distance) ? Math.round(ev.distance) : 0;
    firstByAccount.set(a, { a, t, x: xy.x, y: xy.y, d: distance });
  }

  return [...firstByAccount.values()].sort((left, right) => left.t - right.t);
}

module.exports = { extractLandings };
