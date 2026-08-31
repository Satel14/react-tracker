const { telemetryWeaponCategory, canonicalWeaponKey } = require("../weaponMeta");

// The closed set of silhouettes the kill feed can draw. Exported so a test can
// hold this side and the frontend's drawing table to the same vocabulary: a
// kind added here without a path renders an empty box.
const ICON_KINDS = Object.freeze([
  "ar",
  "dmr",
  "sr",
  "smg",
  "lmg",
  "shotgun",
  "pistol",
  "crossbow",
  "explosive",
  "melee",
  "fists",
  "vehicle",
]);

// Fists are logged as the attacker's own character blueprint.
const FISTS = /^Player(Male|Female)/i;
// An explicit list, not "anything else that starts with Weap": an unmapped gun
// from next patch must fall through to no icon rather than draw a pan.
// "Cowbar" is PUBG's own spelling of the crowbar; matching the English word
// instead of the asset name is how it went missing in the first place.
const MELEE = /^(Item_)?Weap(on_)?(Pan|Machete|Cowbar|Crowbar|Sickle|Pickaxe)(_\d+)?_C$/i;
// Vehicle blueprints. Roadkills report the vehicle that did it.
const VEHICLE = /^BP_/i;
// Thrown things reach the log as the projectile or its lingering damage field,
// neither of which weaponMeta has a row for.
const PROJECTILE = /^Proj/i;

function weaponIcon(rawName) {
  if (typeof rawName !== "string" || !rawName) return null;

  const category = telemetryWeaponCategory(rawName);

  if (category === "throwable") return "explosive";
  if (category === "special") {
    // Crossbow, PanzerFaust, Mortar and C4 share one category upstream because
    // weapon mastery groups them. A bow and a rocket are not one drawing.
    return /crossbow/i.test(canonicalWeaponKey(rawName) || "") ? "crossbow" : "explosive";
  }
  if (category !== "other") return ICON_KINDS.includes(category) ? category : null;

  if (FISTS.test(rawName)) return "fists";
  if (MELEE.test(rawName)) return "melee";
  if (VEHICLE.test(rawName)) return "vehicle";
  if (PROJECTILE.test(rawName)) return "explosive";

  // The blue zone, the red zone, drowning, a fall -- and anything shipped
  // after this table was written. The feed draws a bare arrow for all of them.
  return null;
}

// PUBG draws its own 2D replay with a purpose-built icon per gun -- a 32px-tall
// outline, which is exactly what a feed line wants. Those are shipped under
// frontend/public/images/weapon-icons, and this maps our item keys onto their
// file names.
//
// The names are the game's DISPLAY names, not the telemetry asset names, and
// they are irregular: the AK47 is "akm", the HK416 is "m416", the AUG is
// "aug_a3", the Saiga12 is "s12k". Every row was resolved by asking the CDN,
// not by guessing, and weaponIcon.test.js checks each one against a file that
// is actually on disk -- in both directions, so a misspelled key shows up as
// an orphaned image rather than as a broken one at runtime.
const WEAPON_ICON_FILES = Object.freeze({
  // Not a weapon, but the game draws a mark for it on the same line and
  // in the same folder, so it resolves down the same path.
  BlueZone: "bluezone",

  Item_Weapon_ACE32_C: "ace32",
  Item_Weapon_AK47_C: "akm",
  Item_Weapon_AUG_C: "aug_a3",
  Item_Weapon_AWM_C: "awm",
  Item_Weapon_Berreta686_C: "s686",
  Item_Weapon_BerylM762_C: "m762",
  Item_Weapon_BizonPP19_C: "bizonpp19",
  Item_Weapon_BluezoneGrenade_C: "bluezonegrenade",
  Item_Weapon_C4_C: "c4",
  Item_Weapon_Crossbow_1_C: "crossbow",
  Item_Weapon_Crossbow_C: "crossbow",
  Item_Weapon_DP12_C: "dp_12",
  Item_Weapon_DP28_C: "dp_28",
  Item_Weapon_DesertEagle_C: "deagle",
  Item_Weapon_Dragunov_C: "dragunov",
  Item_Weapon_FAMASG2_C: "famasg2",
  Item_Weapon_FNFal_C: "fnfal",
  Item_Weapon_G36C_C: "g36c",
  Item_Weapon_Grenade_C: "grenade",
  Item_Weapon_Groza_C: "groza",
  Item_Weapon_HK416_C: "m416",
  Item_Weapon_JS9_C: "js9",
  Item_Weapon_K2_C: "k2",
  Item_Weapon_Kar98k_C: "kar98",
  Item_Weapon_L6_C: "lynx",
  Item_Weapon_M16A4_C: "m16a4",
  Item_Weapon_M1911_C: "p1911",
  Item_Weapon_M249_C: "m249",
  Item_Weapon_M24_C: "m24",
  Item_Weapon_M79_C: "m79",
  Item_Weapon_MG3_C: "mg3",
  Item_Weapon_MP5K_C: "mp5k",
  Item_Weapon_MP9_C: "mp9",
  Item_Weapon_Mini14_C: "mini14",
  Item_Weapon_Mk12_C: "mk12",
  Item_Weapon_Mk14_C: "mk14",
  Item_Weapon_Mk47Mutant_C: "mk47",
  Item_Weapon_Molotov_C: "molotov",
  Item_Weapon_Mortar_C: "mortar",
  Item_Weapon_Mosin_C: "mosin_nagant",
  Item_Weapon_NagantM1895_C: "r1895",
  Item_Weapon_OriginS12_C: "o12",
  Item_Weapon_P18C_C: "p18c",
  Item_Weapon_P90_C: "p90",
  Item_Weapon_P92_C: "p92",
  Item_Weapon_PanzerFaust100M_C: "panzerfaust",
  Item_Weapon_QBU88_C: "qbu88",
  Item_Weapon_QBZ95_C: "qbz95",
  Item_Weapon_R45_C: "r45",
  Item_Weapon_RPD_C: "rpd",
  Item_Weapon_SKS_C: "sks",
  Item_Weapon_Saiga12_C: "s12k",
  Item_Weapon_TacticalRifle_C: "mk14",
  Item_Weapon_Thompson_C: "tommy_gun",
  Item_Weapon_UMP9_C: "ump9",
  Item_Weapon_UMP_C: "ump9",
  Item_Weapon_UZI_C: "micro_uzi",
  Item_Weapon_VSS_C: "vss",
  Item_Weapon_Vector_C: "vector",
  Item_Weapon_Win1894_C: "win94",
  Item_Weapon_Win94_C: "win94",
  Item_Weapon_Winchester_C: "s1897",
});

// The gun's own icon, or null when the game has none for it -- the SCAR-L and
// the M9 are gone from PUBG and its CDN carries no picture of them. A null
// here is not an error: weaponIcon's class silhouette is the fallback, and
// saying "an assault rifle" is honest where drawing some other rifle is not.
function weaponIconKey(rawName) {
  if (typeof rawName !== "string" || !rawName) return null;
  const key = canonicalWeaponKey(rawName);
  if (!key) return null;
  // No alias step: the table was generated from every key weaponMeta
  // labels, so the aliased keys (UMP9, Win94, Crossbow_1, TacticalRifle)
  // carry their own rows and resolve to the same file already. Mutating
  // the alias lookup away changed nothing, which is how it was found.
  return WEAPON_ICON_FILES[key] || null;
}

module.exports = { weaponIcon, weaponIconKey, ICON_KINDS, WEAPON_ICON_FILES };
