const WEAPON_LABELS = {
  Item_Weapon_ACE32_C: "ACE32",
  Item_Weapon_AK47_C: "AKM",
  Item_Weapon_AUG_C: "AUG",
  Item_Weapon_AWM_C: "AWM",
  Item_Weapon_Berreta686_C: "S686",
  Item_Weapon_BerylM762_C: "Beryl M762",
  Item_Weapon_BizonPP19_C: "PP-19 Bizon",
  Item_Weapon_BluezoneGrenade_C: "Blue Zone Grenade",
  Item_Weapon_C4_C: "C4",
  Item_Weapon_Crossbow_C: "Crossbow",
  Item_Weapon_Crossbow_1_C: "Crossbow",
  Item_Weapon_DesertEagle_C: "Desert Eagle",
  Item_Weapon_DP12_C: "DBS",
  Item_Weapon_DP28_C: "DP-28",
  Item_Weapon_Dragunov_C: "Dragunov",
  Item_Weapon_FAMASG2_C: "Famas",
  Item_Weapon_FNFal_C: "SLR",
  Item_Weapon_G36C_C: "G36C",
  Item_Weapon_Grenade_C: "Frag Grenade",
  Item_Weapon_Groza_C: "Groza",
  Item_Weapon_HK416_C: "M416",
  Item_Weapon_JS9_C: "JS9",
  Item_Weapon_K2_C: "K2",
  Item_Weapon_Kar98k_C: "Kar98k",
  Item_Weapon_L6_C: "Lynx AMR",
  Item_Weapon_M16A4_C: "M16A4",
  Item_Weapon_M1911_C: "M1911",
  Item_Weapon_M249_C: "M249",
  Item_Weapon_M24_C: "M24",
  Item_Weapon_M9_C: "M9",
  Item_Weapon_MG3_C: "MG3",
  Item_Weapon_RPD_C: "RPD",
  Item_Weapon_Mini14_C: "Mini-14",
  Item_Weapon_Mk12_C: "Mk12",
  Item_Weapon_Mk14_C: "Mk14 EBR",
  Item_Weapon_Mk47Mutant_C: "Mk47 Mutant",
  Item_Weapon_Molotov_C: "Molotov",
  Item_Weapon_M79_C: "M79",
  Item_Weapon_Mortar_C: "Mortar",
  Item_Weapon_MP5K_C: "MP5K",
  Item_Weapon_MP9_C: "MP9",
  Item_Weapon_Mosin_C: "Mosin",
  Item_Weapon_NagantM1895_C: "R1895",
  Item_Weapon_OriginS12_C: "Origin S12",
  Item_Weapon_P18C_C: "P18C",
  Item_Weapon_P90_C: "P90",
  Item_Weapon_P92_C: "P92",
  Item_Weapon_PanzerFaust100M_C: "PanzerFaust",
  Item_Weapon_QBU88_C: "QBU",
  Item_Weapon_QBZ95_C: "QBZ",
  Item_Weapon_R45_C: "R45",
  "Item_Weapon_SCAR-L_C": "Scar-L",
  Item_Weapon_SKS_C: "SKS",
  Item_Weapon_Saiga12_C: "O12",
  Item_Weapon_TacticalRifle_C: "Mk14 EBR",
  Item_Weapon_Thompson_C: "Tommy Gun",
  Item_Weapon_UMP_C: "UMP45",
  Item_Weapon_UMP9_C: "UMP45",
  Item_Weapon_UZI_C: "Micro Uzi",
  Item_Weapon_VSS_C: "VSS",
  Item_Weapon_Vector_C: "Vector",
  Item_Weapon_Win1894_C: "Win94",
  Item_Weapon_Win94_C: "Win94",
  Item_Weapon_Winchester_C: "S1897",
};

const WEAPON_CATEGORY = {
  Item_Weapon_ACE32_C: "ar",
  Item_Weapon_AK47_C: "ar",
  Item_Weapon_AUG_C: "ar",
  Item_Weapon_BerylM762_C: "ar",
  Item_Weapon_FAMASG2_C: "ar",
  Item_Weapon_G36C_C: "ar",
  Item_Weapon_Groza_C: "ar",
  Item_Weapon_HK416_C: "ar",
  Item_Weapon_K2_C: "ar",
  Item_Weapon_M16A4_C: "ar",
  Item_Weapon_Mk47Mutant_C: "ar",
  Item_Weapon_QBZ95_C: "ar",
  "Item_Weapon_SCAR-L_C": "ar",

  Item_Weapon_Dragunov_C: "dmr",
  Item_Weapon_FNFal_C: "dmr",
  Item_Weapon_Mini14_C: "dmr",
  Item_Weapon_Mk12_C: "dmr",
  Item_Weapon_Mk14_C: "dmr",
  Item_Weapon_QBU88_C: "dmr",
  Item_Weapon_SKS_C: "dmr",
  Item_Weapon_TacticalRifle_C: "dmr",
  Item_Weapon_VSS_C: "dmr",

  Item_Weapon_AWM_C: "sr",
  Item_Weapon_Kar98k_C: "sr",
  Item_Weapon_L6_C: "sr",
  Item_Weapon_M24_C: "sr",
  Item_Weapon_Mosin_C: "sr",
  Item_Weapon_Win1894_C: "sr",
  Item_Weapon_Win94_C: "sr",

  Item_Weapon_BizonPP19_C: "smg",
  Item_Weapon_JS9_C: "smg",
  Item_Weapon_MP5K_C: "smg",
  Item_Weapon_MP9_C: "smg",
  Item_Weapon_P90_C: "smg",
  Item_Weapon_Thompson_C: "smg",
  Item_Weapon_UMP_C: "smg",
  Item_Weapon_UMP9_C: "smg",
  Item_Weapon_UZI_C: "smg",
  Item_Weapon_Vector_C: "smg",

  Item_Weapon_DP28_C: "lmg",
  Item_Weapon_M249_C: "lmg",
  Item_Weapon_MG3_C: "lmg",
  Item_Weapon_RPD_C: "lmg",

  Item_Weapon_Berreta686_C: "shotgun",
  Item_Weapon_DP12_C: "shotgun",
  Item_Weapon_OriginS12_C: "shotgun",
  Item_Weapon_Saiga12_C: "shotgun",
  Item_Weapon_Winchester_C: "shotgun",

  Item_Weapon_DesertEagle_C: "pistol",
  Item_Weapon_M1911_C: "pistol",
  Item_Weapon_M9_C: "pistol",
  Item_Weapon_NagantM1895_C: "pistol",
  Item_Weapon_P18C_C: "pistol",
  Item_Weapon_P92_C: "pistol",
  Item_Weapon_R45_C: "pistol",

  Item_Weapon_Crossbow_C: "special",
  Item_Weapon_Crossbow_1_C: "special",
  Item_Weapon_PanzerFaust100M_C: "special",
  Item_Weapon_Mortar_C: "special",
  Item_Weapon_M79_C: "special",
  Item_Weapon_C4_C: "special",

  Item_Weapon_Grenade_C: "throwable",
  Item_Weapon_Molotov_C: "throwable",
  Item_Weapon_BluezoneGrenade_C: "throwable",
};

const WEAPON_IMAGE_ALIAS = {
  Item_Weapon_UMP9_C: "Item_Weapon_UMP_C",
  Item_Weapon_Win94_C: "Item_Weapon_Win1894_C",
  Item_Weapon_Crossbow_1_C: "Item_Weapon_Crossbow_C",
  Item_Weapon_TacticalRifle_C: "Item_Weapon_Mk14_C",
};

// PanzerFaust's damageCauserName forms (trailing-1 direct hit, unprefixed splash) don't fold to its item key by case or by the Weap-prefix rule.
// Thrown and launched weapons fire under their item id but deal damage under a
// projectile or effect-actor causer, which no case or prefix rule can fold together.
const WEAPON_KEY_ALIASES = new Map([
  ["weappanzerfaust100m1_c", "Item_Weapon_PanzerFaust100M_C"],
  ["panzerfaust100m_projectile_c", "Item_Weapon_PanzerFaust100M_C"],
  ["projgrenade_c", "Item_Weapon_Grenade_C"],
  ["projc4_c", "Item_Weapon_C4_C"],
  ["bluezonebomb_effectactor_c", "Item_Weapon_BluezoneGrenade_C"],
  ["bp_fireeffectcontroller_c", "Item_Weapon_Molotov_C"],
  ["bp_molotovfiredebuff_c", "Item_Weapon_Molotov_C"],
]);

const WEAPON_KEY_BY_LOWER = new Map(Object.keys(WEAPON_LABELS).map((key) => [key.toLowerCase(), key]));

function readableWeaponName(rawName) {
  if (!rawName) return "Unknown";
  if (WEAPON_LABELS[rawName]) return WEAPON_LABELS[rawName];
  return rawName
    .replace(/^Item_Weapon_/i, "")
    .replace(/_C$/i, "")
    .replace(/_/g, " ");
}

function weaponImageKey(rawName) {
  if (!rawName) return null;
  return WEAPON_IMAGE_ALIAS[rawName] || rawName;
}

function weaponCategory(rawName) {
  return WEAPON_CATEGORY[rawName] || "other";
}

// Telemetry damageCauserName looks like "WeapAK47_C"; the mastery maps use
// "Item_Weapon_AK47_C". Bridge one to the other.
function telemetryToItemKey(name) {
  if (typeof name !== "string" || !name.startsWith("Weap")) return null;
  const core = name.replace(/^Weap/, "").replace(/_C$/, "");
  return `Item_Weapon_${core}_C`;
}

function prettifyCauser(name) {
  if (typeof name !== "string" || !name) return "Unknown";
  return name
    .replace(/^Item_Weapon_/i, "")
    .replace(/^Weap/i, "")
    .replace(/^Buff_/i, "")
    .replace(/^Proj_?/i, "")
    .replace(/^BP_/i, "")
    .replace(/_C$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim() || "Unknown";
}

function telemetryWeaponName(name) {
  if (!name) return "Unknown";
  const key = canonicalWeaponKey(name);
  if (key && WEAPON_LABELS[key]) return WEAPON_LABELS[key];
  return prettifyCauser(name);
}

function telemetryWeaponCategory(name) {
  const key = canonicalWeaponKey(name);
  return key ? weaponCategory(key) : "other";
}

// itemId and damageCauserName can name the same gun with different case (FAMASG2 vs FamasG2); fold both to WEAPON_LABELS' casing so they join.
function canonicalWeaponKey(rawName) {
  if (typeof rawName !== "string" || !rawName) return null;
  const aliased = WEAPON_KEY_ALIASES.get(rawName.toLowerCase());
  if (aliased) return aliased;
  const itemKey = rawName.startsWith("Weap") ? telemetryToItemKey(rawName) || rawName : rawName;
  return WEAPON_KEY_BY_LOWER.get(itemKey.toLowerCase()) || itemKey;
}

module.exports = {
  WEAPON_LABELS,
  WEAPON_CATEGORY,
  WEAPON_IMAGE_ALIAS,
  readableWeaponName,
  weaponImageKey,
  weaponCategory,
  telemetryToItemKey,
  telemetryWeaponName,
  telemetryWeaponCategory,
  canonicalWeaponKey,
};
