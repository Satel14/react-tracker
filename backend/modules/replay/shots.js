const { readXY } = require("../telemetryUtils");

// Gunfire shot lines, packed column-wise so the replay payload stays small:
// eight parallel arrays where index i is one attacker->victim tracer.

// Coordinates are integer metres, the same scale readXY gives kills[].vx/vy and
// player positions, so the frontend can draw a shot line in the map space it
// already uses without a second conversion.
function readEndpoint(loc) {
  // readXY only rejects non-finite numbers; a dead-centre origin is telemetry's
  // "unknown", not a real map position, so reject it before converting.
  const x = Number(loc?.x);
  const y = Number(loc?.y);
  if (x === 0 && y === 0) return null;
  return readXY(loc);
}

function extractShots(telemetry, clock) {
  const t = [];
  const a = [];
  const v = [];
  const ax = [];
  const ay = [];
  const vx = [];
  const vy = [];
  const dmg = [];
  const out = { t, a, v, ax, ay, vx, vy, dmg };

  const timeOf = typeof clock?.timeOf === "function" ? clock.timeOf.bind(clock) : null;
  if (!timeOf) return out;

  const rows = [];
  const seen = new Set();

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerTakeDamage") continue;
    // Strict equality: Damage_DBNO (hits on an already-knocked player) would
    // double-count a fight, and Damage_BlueZone alone outnumbers real gunfire.
    if (ev.damageTypeCategory !== "Damage_Gun") continue;

    const attackerId = ev.attacker?.accountId;
    const victimId = ev.victim?.accountId;
    if (!attackerId || !victimId) continue;

    const from = readEndpoint(ev.attacker?.location);
    if (!from) continue;
    const to = readEndpoint(ev.victim?.location);
    if (!to) continue;

    const time = timeOf(ev);
    if (typeof time !== "number" || !Number.isFinite(time)) continue;

    // One attackId can hit several victims (shared pellet group / one bullet
    // through two bodies), and each is its own line, so the pair is the key.
    const key = `${ev.attackId} ${victimId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const amount = Number(ev.damage);
    rows.push({
      t: time,
      a: attackerId,
      v: victimId,
      ax: from.x,
      ay: from.y,
      vx: to.x,
      vy: to.y,
      dmg: Number.isFinite(amount) ? Math.round(amount) : 0,
    });
  }

  rows.sort((p, q) => p.t - q.t);

  for (const row of rows) {
    t.push(row.t);
    a.push(row.a);
    v.push(row.v);
    ax.push(row.ax);
    ay.push(row.ay);
    vx.push(row.vx);
    vy.push(row.vy);
    dmg.push(row.dmg);
  }

  return out;
}

module.exports = { extractShots };
