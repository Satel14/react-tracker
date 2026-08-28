const { readXY } = require("../telemetryUtils");

function accountOf(actor) {
  const id = actor?.accountId;
  return typeof id === "string" && id ? id : null;
}

// Telemetry distances are centimetres; the replay overlay wants metres.
function distanceMetres(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n / 100) : 0;
}

function extractKnocks(telemetry, clock) {
  const knocks = [];
  const revives = [];
  const timeOf = typeof clock?.timeOf === "function" ? clock.timeOf.bind(clock) : () => null;

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    const type = ev?._T;
    if (type !== "LogPlayerMakeGroggy" && type !== "LogPlayerRevive") continue;

    const v = accountOf(ev.victim);
    if (!v) continue;
    const vxy = readXY(ev.victim?.location);
    if (!vxy) continue;
    const t = timeOf(ev);
    if (!Number.isFinite(t)) continue;

    if (type === "LogPlayerRevive") {
      revives.push({ t, a: accountOf(ev.reviver), v, x: vxy.x, y: vxy.y });
      continue;
    }

    // A knock with no attacker is still a knock: blue zone, falls and the
    // red zone all groggy players with nobody credited.
    const attacker = ev.attacker || null;
    const axy = attacker ? readXY(attacker.location) : null;
    knocks.push({
      t,
      a: accountOf(attacker),
      v,
      ax: axy ? axy.x : null,
      ay: axy ? axy.y : null,
      vx: vxy.x,
      vy: vxy.y,
      w: ev.damageCauserName || null,
      r: ev.damageReason || null,
      dist: distanceMetres(ev.distance),
      id: ev.dBNOId ?? null,
    });
  }

  knocks.sort((a, b) => a.t - b.t);
  revives.sort((a, b) => a.t - b.t);
  return { knocks, revives };
}

module.exports = { extractKnocks };
