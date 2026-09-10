const { isFocalActor } = require("./telemetryUtils");
const { telemetryWeaponName } = require("./weaponMeta");

// What the focal player was carrying, reconstructed from the item log.
//
// There is no inventory snapshot anywhere in telemetry, so the only route is to
// replay LogItemEquip / Unequip / Attach / Detach. Two measured facts shape all
// of this:
//
// 1. The state at the END of the log is useless: death strips everything, and
//    all 8 sampled matches ended holding only an ascender, a blue chip and a
//    parachute. So the replay stops at a CUTOFF -- the player's death, or for a
//    survivor their last position sample, since the end of a match may strip
//    the inventory the same way.
// 2. Telemetry is NOT ordered. Roughly 600 events a match arrive out of order,
//    with steps back of up to 78 seconds. So the cutoff is a timestamp
//    comparison and never "stop at the death event in the file" -- that would
//    silently apply post-death equips and still satisfy every sanity check.
//
// With the death cutoff applied, 8 of 8 sampled matches reconstruct within the
// game's own equip caps.

// PUBG files the repair kit under Weapon/Main. It was the sole cause of every
// breach of those caps, so it never occupies a weapon slot.
const PSEUDO_WEAPONS = new Set(["Item_Weapon_IntegratedRepair_C"]);

// Not chosen gear -- everybody starts with it.
const NOT_GEAR = new Set(["Item_Back_B_01_StartParachutePack_C"]);

const WEAPON_SLOTS = ["Main", "Handgun", "Melee"];
const ARMOUR_SLOTS = ["Headgear", "Vest", "Backpack"];
// The order a player reads a gun in, not insertion order.
const ATTACHMENT_SLOTS = ["Upper", "Muzzle", "Magazine", "Lower", "Stock"];

// Magnification is the one attachment identity that changes how a loadout
// reads, so sights are named and everything else is its slot. Seven of the
// eight measured Upper ids are here; DualOptic_4x1x is left out on purpose --
// its in-game name is unconfirmed, and a generic label beats a guess.
const SIGHTS = [
  [/DotSight_01/, "Red Dot Sight"],
  [/Holosight/, "Holographic Sight"],
  [/Aimpoint/, "2x Aimpoint Scope"],
  [/Scope3x/, "3x Backlit Scope"],
  [/ACOG_01/, "4x ACOG Scope"],
  [/Scope6x/, "6x Scope"],
  [/CQBSS/, "8x CQBSS Scope"],
];

const timeOf = (ev) => {
  const t = Date.parse(ev?._D);
  return Number.isFinite(t) ? t : null;
};

// Item ids are not consistent about the trailing _C: Item_Back_BlueBlocker and
// Item_Back_BlueBlocker_Lv1 both ship without one.
function armourLevel(itemId) {
  const m = /_Lv(\d)/.exec(String(itemId || ""));
  return m ? Number(m[1]) : null;
}

function attachmentSlot(itemId) {
  const m = /^Item_Attach_Weapon_([A-Za-z]+)_/.exec(String(itemId || ""));
  return m && ATTACHMENT_SLOTS.includes(m[1]) ? m[1] : null;
}

function sightName(itemId) {
  const id = String(itemId || "");
  for (const [pattern, name] of SIGHTS) if (pattern.test(id)) return name;
  return null;
}

function rosterNames(events) {
  const names = new Map();
  for (const ev of events) {
    if (ev?._T !== "LogMatchStart") continue;
    for (const c of ev.characters || []) {
      const ch = c?.character || c;
      if (ch?.accountId && ch?.name) names.set(ch.accountId, ch.name);
    }
  }
  return names;
}

const EMPTY = () => ({
  cutoff: null, weapons: [], armour: [], lootedFrom: [],
  picked: 0, dropped: 0, fromCarePackage: 0,
});

function buildLoadout(telemetry, { accountId = null, playerName = null } = {}) {
  const events = Array.isArray(telemetry) ? telemetry : [];
  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  const lowerName = typeof playerName === "string" && playerName.trim() ? playerName.trim().toLowerCase() : null;
  const mine = (actor) => isFocalActor(actor, accountKey, lowerName);

  // Pass 1: find the cutoff. Death if there is one, otherwise the last position
  // sample -- and null when the player is not in this match at all.
  let deathAt = null;
  let lastSeen = null;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const t = timeOf(ev);
    if (t === null) continue;
    if (ev._T === "LogPlayerKillV2" && mine(ev.victim)) {
      if (deathAt === null || t < deathAt) deathAt = t;
    }
    if (ev._T === "LogPlayerPosition" && mine(ev.character)) {
      if (lastSeen === null || t > lastSeen) lastSeen = t;
    }
  }
  if (deathAt === null && lastSeen === null) return EMPTY();
  const cutoffAt = deathAt !== null ? deathAt : lastSeen;
  const cutoff = deathAt !== null ? "death" : "survived";

  // Pass 2: replay up to the cutoff.
  const equipped = new Map(); // itemId -> { slot }
  const attached = new Map(); // parent itemId -> Set(child itemId)
  const looted = new Map(); // creator accountId -> count
  let picked = 0;
  let dropped = 0;
  let fromCarePackage = 0;

  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const t = timeOf(ev);
    if (t === null || t > cutoffAt) continue;
    if (!mine(ev.character)) continue;

    switch (ev._T) {
      case "LogItemEquip": {
        const it = ev.item || {};
        if (!it.itemId || NOT_GEAR.has(it.itemId) || PSEUDO_WEAPONS.has(it.itemId)) break;
        equipped.set(it.itemId, { slot: it.subCategory || null });
        break;
      }
      case "LogItemUnequip":
        equipped.delete(ev.item?.itemId);
        break;
      case "LogItemAttach": {
        const parent = ev.parentItem?.itemId;
        const child = ev.childItem?.itemId;
        if (!parent || !child) break;
        if (!attached.has(parent)) attached.set(parent, new Set());
        attached.get(parent).add(child);
        break;
      }
      case "LogItemDetach":
        attached.get(ev.parentItem?.itemId)?.delete(ev.childItem?.itemId);
        break;
      case "LogItemPickup":
        picked += 1;
        break;
      case "LogItemDrop":
        dropped += 1;
        break;
      case "LogItemPickupFromCarepackage":
        fromCarePackage += 1;
        break;
      case "LogItemPickupFromLootBox": {
        const creator = ev.creatorAccountId;
        if (creator) looted.set(creator, (looted.get(creator) || 0) + 1);
        break;
      }
      default:
        break;
    }
  }

  const weapons = [];
  for (const slot of WEAPON_SLOTS) {
    for (const [key, info] of equipped) {
      if (info.slot !== slot) continue;
      const kids = [...(attached.get(key) || [])]
        .map((id) => ({ slot: attachmentSlot(id), name: sightName(id) }))
        .filter((a) => a.slot !== null)
        .sort((a, b) => ATTACHMENT_SLOTS.indexOf(a.slot) - ATTACHMENT_SLOTS.indexOf(b.slot));
      weapons.push({ key, name: telemetryWeaponName(key), slot, attachments: kids });
    }
  }

  const armour = [];
  for (const slot of ARMOUR_SLOTS) {
    for (const [key, info] of equipped) {
      if (info.slot !== slot) continue;
      armour.push({ slot, key, level: armourLevel(key) });
    }
  }

  // A creator nobody can name is dropped rather than shown as an account id.
  const names = rosterNames(events);
  const lootedFrom = [...looted.entries()]
    .filter(([id]) => names.has(id))
    .map(([id, items]) => ({ accountId: id, name: names.get(id), items }))
    .sort((a, b) => b.items - a.items || a.name.localeCompare(b.name));

  return { cutoff, weapons, armour, lootedFrom, picked, dropped, fromCarePackage };
}

module.exports = { buildLoadout };
