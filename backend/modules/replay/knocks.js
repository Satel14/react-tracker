const { readXY } = require("../telemetryUtils");
const { telemetryWeaponName } = require("../weaponMeta");
const { weaponIcon, weaponIconKey } = require("./weaponIcon");

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
      // Resolved here, not on the client: the frontend has no copy of the
      // weapon table, and one gun has to read the same in a knock line as in
      // the kill line under it. A knock the zone or a fall made has no
      // attacker, and then this names what did it.
      w: ev.damageCauserName ? telemetryWeaponName(ev.damageCauserName) : null,
      wi: weaponIcon(ev.damageCauserName),
      wk: weaponIconKey(ev.damageCauserName),
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
