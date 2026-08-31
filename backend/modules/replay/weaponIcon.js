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

module.exports = { weaponIcon, ICON_KINDS };
