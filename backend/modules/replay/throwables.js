const { readXY } = require("../telemetryUtils");
const { telemetryWeaponName } = require("../weaponMeta");

// Thrown items, packed column-wise like replay/shots.js: parallel arrays where
// index i is one throw. Whole lobby, no focal filter -- same as shots.
//
// The marker sits where the item was THROWN FROM. Telemetry has nowhere else to
// put it: the full 43-event universe of a real match was enumerated on
// 2026-09-10 and nothing carries a landing position. The only companion to a
// throw is LogPlayerAttack (170 of 170), which repeats the thrower and weapon.
//
// For a throw that damaged somebody, LogPlayerTakeDamage on the same attackId
// gives a second point. That is a VICTIM, not the item -- exactly as the shot
// layer's endpoint is -- and it sits a median of 42 m from the thrower (max 100,
// n=27). Which is the whole reason the origin cannot be presented as an impact.
const DAMAGE_CAPABLE = new Set([
  "Item_Weapon_Grenade_C",
  "Item_Weapon_Molotov_C",
  "Item_Weapon_C4_C",
  "Item_Weapon_M79_C",
  "Item_Weapon_BluezoneGrenade_C",
]);

// What an unnamed throwable is called. weaponMeta names 8 of the 9 kinds seen
// live; Item_Weapon_CoverStructDropHandFlare_C is the one it does not.
const GENERIC_NAME = "Throwable";

// A dead-centre origin is telemetry's "unknown", not a real map position. Same
// guard, same reason, as readEndpoint in shots.js.
function readPoint(loc) {
  const x = Number(loc?.x);
  const y = Number(loc?.y);
  if (x === 0 && y === 0) return null;
  return readXY(loc);
}

function extractThrowables(telemetry, clock) {
  const empty = { throws: { t: [], k: [], ax: [], ay: [], vx: [], vy: [] }, throwKinds: [] };
  const timeOf = typeof clock?.timeOf === "function" ? clock.timeOf.bind(clock) : null;
  if (!timeOf) return empty;
  const events = Array.isArray(telemetry) ? telemetry : [];

  // attackId -> { damage, at, x, y } for the earliest damage event of that
  // attack. Sum over every hit, but keep only the first point.
  const hits = new Map();
  for (const ev of events) {
    if (ev?._T !== "LogPlayerTakeDamage") continue;
    const id = ev.attackId;
    if (id == null) continue;
    const amount = Number(ev.damage);
    // A zero-damage event is a hit that took nothing off, and there are plenty:
    // 16 of the 27 damage events on a throw in one measured match. Twelve of
    // those were one molotov burning a victim already at 0 health -- the fire
    // keeps ticking on a body. Excluded on purpose, because the legend says
    // "throw that dealt damage" and a line drawn for 0 would contradict it.
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const at = timeOf(ev);
    const point = readPoint(ev.victim?.location);
    const entry = hits.get(id) || { damage: 0, at: null, x: null, y: null };
    entry.damage += amount;
    if (point && (entry.at === null || (typeof at === "number" && at < entry.at))) {
      entry.at = typeof at === "number" ? at : entry.at;
      entry.x = point.x;
      entry.y = point.y;
    }
    hits.set(id, entry);
  }

  const rows = [];
  // Insertion-ordered, so throwKinds comes out in first-seen order and the
  // index in `k` is stable for the life of one payload.
  const kinds = new Map();

  for (const ev of events) {
    if (ev?._T !== "LogPlayerUseThrowable") continue;
    const from = readPoint(ev.attacker?.location);
    if (!from) continue;
    const time = timeOf(ev);
    if (typeof time !== "number" || !Number.isFinite(time)) continue;

    const itemId = ev.weapon?.itemId;
    const name = telemetryWeaponName(itemId) || GENERIC_NAME;
    const hit = ev.attackId == null ? null : hits.get(ev.attackId) || null;
    const damage = hit ? hit.damage : 0;

    const kind = kinds.get(name) || {
      name,
      // Known damage-capable, or demonstrated by having damaged somebody. The
      // second half is what classifies a throwable PUBG adds later without this
      // file having to chase the item list.
      damaging: DAMAGE_CAPABLE.has(itemId),
      thrown: 0,
      damage: 0,
    };
    kind.thrown += 1;
    kind.damage += damage;
    if (damage > 0) kind.damaging = true;
    kinds.set(name, kind);

    rows.push({
      t: time,
      name,
      ax: from.x,
      ay: from.y,
      vx: hit && hit.x !== null ? hit.x : null,
      vy: hit && hit.y !== null ? hit.y : null,
    });
  }

  rows.sort((p, q) => p.t - q.t);

  const throwKinds = [...kinds.values()].map((k) => ({ ...k, damage: Math.round(k.damage) }));
  const indexOfName = new Map(throwKinds.map((k, i) => [k.name, i]));

  const out = { throws: { t: [], k: [], ax: [], ay: [], vx: [], vy: [] }, throwKinds };
  for (const row of rows) {
    out.throws.t.push(row.t);
    out.throws.k.push(indexOfName.get(row.name));
    out.throws.ax.push(row.ax);
    out.throws.ay.push(row.ay);
    out.throws.vx.push(row.vx);
    out.throws.vy.push(row.vy);
  }
  return out;
}

module.exports = { extractThrowables };
