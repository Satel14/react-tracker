const { isFocalActor } = require("./telemetryUtils");
const { armourLevel } = require("./itemNames");

// Armour broken, property damaged, and how the player moved through the world.
//
// A first sweep reported the armour and vehicle counts as ZERO for the focal
// player and nearly retired this package. That was the probe's fault: it took
// only the first actor off each event (character ?? attacker ?? victim), so a
// player appearing as attacker or victim never counted. Re-measured per side,
// the real figures are 2.8 armour broken and 1.5 lost per match.
//
// LogVehicleDamage is damage TO a vehicle. It is not Damage_VehicleHit, which is
// a vehicle hitting a player and is already filtered out of parseDamage -- so
// none of this is a re-slice of an existing total.
//
// Not here, both measured dead over 10 matches: vehicles destroyed (0, despite
// 1429 damage dealt to them -- a car simply has far more health than a player)
// and swimming (0 seconds).

// Only these two are worth a row. ItemBox, Hay, SmokeCylinder_Long and Door also
// appear under LogObjectDestroy and are small residue.
const DESTROY_ROWS = { Window: "windows", Fence: "fences" };

// Highest level first, with a level-less armour id last.
const byLevelDesc = (a, b) => {
  if (a.level === null) return 1;
  if (b.level === null) return -1;
  return b.level - a.level;
};

const tally = (counts) =>
  [...counts.entries()]
    .map(([level, count]) => ({ level: level === "null" ? null : Number(level), count }))
    .sort(byLevelDesc);

function buildEnvironment(telemetry, { accountId = null, playerName = null } = {}) {
  const events = Array.isArray(telemetry) ? telemetry : [];
  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  const lowerName = typeof playerName === "string" && playerName.trim() ? playerName.trim().toLowerCase() : null;
  const mine = (actor) => isFocalActor(actor, accountKey, lowerName);

  const broke = new Map();
  const lost = new Map();
  let vehicleDamage = 0;
  let windows = 0;
  let fences = 0;
  let vaults = 0;
  let doorsOpened = 0;
  let vending = 0;

  const bump = (map, itemId) => {
    const key = String(armourLevel(itemId));
    map.set(key, (map.get(key) || 0) + 1);
  };

  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;

    if (ev._T === "LogArmorDestroy") {
      const itemId = ev.item?.itemId;
      // Both sides, deliberately: this is the distinction the first probe lost.
      if (mine(ev.attacker)) bump(broke, itemId);
      if (mine(ev.victim)) bump(lost, itemId);
      continue;
    }

    if (ev._T === "LogVehicleDamage") {
      if (!mine(ev.attacker)) continue;
      const d = Number(ev.damage);
      if (Number.isFinite(d) && d > 0) vehicleDamage += d;
      continue;
    }

    if (!mine(ev.character)) continue;

    if (ev._T === "LogVaultStart") vaults += 1;
    else if (ev._T === "LogObjectInteraction") {
      if (ev.objectType === "Door" && ev.objectTypeStatus === "Opening") doorsOpened += 1;
      else if (ev.objectType === "VendingMachine") vending += 1;
    } else if (ev._T === "LogObjectDestroy") {
      const row = DESTROY_ROWS[ev.objectType];
      if (row === "windows") windows += 1;
      else if (row === "fences") fences += 1;
    }
  }

  return {
    armourBroke: tally(broke),
    armourLost: tally(lost),
    vehicleDamage: Math.round(vehicleDamage),
    windows,
    fences,
    vaults,
    doorsOpened,
    vending,
  };
}

module.exports = { buildEnvironment };
