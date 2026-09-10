// Display names for consumables. weaponMeta is no use here: it returns null for
// Item_Heal_FirstAid_C and "Item Heal Bandage" for the bandage, because its
// tables are about weapons.
//
// A curated table carries the spellings the game uses -- "Painkiller" not "Pain
// Killer", "Jerrycan" not "Jerry Can" -- and anything unlisted falls back to
// splitting the id.
//
// That fallback was deliberately REFUSED for POI names in poiNames.js, and the
// difference is in the data: an item id is camelCase and carries word
// boundaries (Item_Heal_FirstAid_C -> "First Aid"), while a POI slug is
// flattened to lowercase (ferrypier), where nothing short of a dictionary tells
// "Ferry Pier" from "Boatyard".
const ITEM_NAMES = Object.freeze({
  Item_Heal_Bandage_C: "Bandage",
  Item_Heal_FirstAid_C: "First Aid Kit",
  Item_Heal_MedKit_C: "Med Kit",
  Item_Boost_EnergyDrink_C: "Energy Drink",
  Item_Boost_PainKiller_C: "Painkiller",
  Item_Boost_AdrenalineSyringe_C: "Adrenaline Syringe",
  Item_Bluechip_C: "Blue Chip",
  Item_EmergencyPickup_C: "Emergency Pickup",
  Item_JerryCan_C: "Jerrycan",
});

// The type segments an id may carry between "Item_" and the name itself. Dropped
// so Item_Heal_FirstAid_C reads "First Aid" rather than "Heal First Aid".
const TYPE_SEGMENTS = new Set(["heal", "boost", "weapon", "attach", "armor", "back", "ammo", "special"]);

// The Lv token is the only part of an armour id that carries information --
// Item_Head_F_01_Lv2_C against Item_Head_G_01_Lv2_C is a skin. Some armour has
// no level at all (Item_Back_BlueBlocker), and several ids ship without the
// trailing _C, so neither may be assumed.
function armourLevel(itemId) {
  const m = /_Lv(\d)/.exec(typeof itemId === "string" ? itemId : "");
  return m ? Number(m[1]) : null;
}

function splitCamel(word) {
  return word.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
}

function itemName(itemId) {
  if (typeof itemId !== "string") return null;
  const id = itemId.trim();
  if (!id) return null;
  if (ITEM_NAMES[id]) return ITEM_NAMES[id];

  const parts = id.split("_").filter(Boolean);
  if (parts[0] === "Item") parts.shift();
  if (parts[parts.length - 1] === "C") parts.pop();
  while (parts.length > 1 && TYPE_SEGMENTS.has(parts[0].toLowerCase())) parts.shift();

  // No length guard above it: an id that leaves nothing behind joins to "" and
  // the `|| null` here is what catches it. A guard would be dead code.
  const name = parts.map(splitCamel).join(" ").trim();
  return name || null;
}

module.exports = { itemName, armourLevel, ITEM_NAMES };
