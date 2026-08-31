// Every point of health that came off a player, and who took it off them.
//
// Column-packed like shots, but keyed by PLAYER INDEX rather than account id:
// an id is forty characters, this is the densest layer in the payload, and the
// frontend already holds the players array these index into -- it needs their
// live positions from it to float a number off the right marker anyway.
//
// Not only gunfire. The zone, a car, a grenade, a fall, a jerry can: each one
// is a number the player watched come off their own health bar, and a damage
// layer that showed only bullets would be silent through the whole late game.

function extractDamage(telemetry, clock, playerIndex) {
  const t = [];
  const a = [];
  const v = [];
  const d = [];
  const out = { t, a, v, d };

  const timeOf = typeof clock?.timeOf === "function" ? clock.timeOf.bind(clock) : null;
  if (!timeOf || !(playerIndex instanceof Map) || playerIndex.size === 0) return out;

  const rows = [];
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerTakeDamage") continue;

    const victimId = ev.victim?.accountId;
    if (!victimId || !playerIndex.has(victimId)) continue;

    // A match carries thousands of zero-damage rows: every bleed-out tick on a
    // knocked player, every punch that landed on armour. A floating zero is
    // noise, and they outnumber the real hits three to one.
    const amount = Number(ev.damage);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const time = timeOf(ev);
    if (typeof time !== "number" || !Number.isFinite(time)) continue;

    // Nobody is credited for a player's damage to themselves -- a jerry can
    // they shot, a fall they took. The number against them is real and shows;
    // crediting them as their own attacker would put a "damage dealt" number
    // on them for it. Same for an attacker the roster never saw: there is no
    // marker to fly a number off.
    const attackerId = ev.attacker?.accountId;
    const attacker = attackerId && attackerId !== victimId && playerIndex.has(attackerId)
      ? playerIndex.get(attackerId)
      : -1;

    rows.push({ t: time, a: attacker, v: playerIndex.get(victimId), d: Math.round(amount) });
  }

  rows.sort((p, q) => p.t - q.t);
  for (const row of rows) {
    t.push(row.t);
    a.push(row.a);
    v.push(row.v);
    d.push(row.d);
  }
  return out;
}

module.exports = { extractDamage };
