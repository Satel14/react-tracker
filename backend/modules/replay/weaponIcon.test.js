const { test } = require("node:test");
const assert = require("node:assert/strict");
const { weaponIcon, ICON_KINDS } = require("./weaponIcon");

// The kill feed draws a silhouette, not a name, so every causer telemetry can
// name has to land on one of a closed set of drawings. weaponMeta's categories
// get most of the way there and are reused rather than restated -- but its
// "other" bucket holds fists, cars, pans and the blue zone all at once, and
// those are four different pictures.

test("passes weaponMeta's gun categories straight through", () => {
  assert.equal(weaponIcon("WeapAUG_C"), "ar");
  assert.equal(weaponIcon("WeapMk14_C"), "dmr");
  assert.equal(weaponIcon("WeapKar98k_C"), "sr");
  assert.equal(weaponIcon("WeapVector_C"), "smg");
  assert.equal(weaponIcon("WeapM249_C"), "lmg");
  assert.equal(weaponIcon("WeapSaiga12_C"), "shotgun");
  assert.equal(weaponIcon("WeapDesertEagle_C"), "pistol");
});

test("splits weaponMeta's mixed special bucket into a bow and explosives", () => {
  // Crossbow, PanzerFaust, Mortar and C4 share one category there because
  // mastery groups them; they do not share a silhouette.
  assert.equal(weaponIcon("WeapCrossbow_C"), "crossbow");
  assert.equal(weaponIcon("WeapPanzerFaust100M_C"), "explosive");
  assert.equal(weaponIcon("WeapMortar_C"), "explosive");
  assert.equal(weaponIcon("WeapC4_C"), "explosive");
});

test("draws every thrown thing as one explosive, projectile name or not", () => {
  // A frag kill reports the weapon; a molotov kill reports the burning
  // projectile, which weaponMeta has no row for at all.
  assert.equal(weaponIcon("WeapGrenade_C"), "explosive");
  assert.equal(weaponIcon("ProjMolotov_C"), "explosive");
  assert.equal(weaponIcon("ProjMolotov_DamageField_C"), "explosive");
});

test("tells fists, a melee weapon and a car apart inside weaponMeta's other", () => {
  // All four of these are "other" upstream. In the feed they are a fist, a
  // pan, a car and no icon at all.
  assert.equal(weaponIcon("PlayerFemale_A_C"), "fists");
  assert.equal(weaponIcon("PlayerMale_A_C"), "fists");
  assert.equal(weaponIcon("WeapPan_C"), "melee");
  assert.equal(weaponIcon("WeapMachete_C"), "melee");
  assert.equal(weaponIcon("BP_CoupeRB_C"), "vehicle");
  assert.equal(weaponIcon("BP_Motorbike_04_C"), "vehicle");
});

test("gives the zone and a drowning no weapon at all", () => {
  // The game draws a bare arrow for a death nobody shot, and so do we.
  assert.equal(weaponIcon("BlueZone"), null);
  assert.equal(weaponIcon("RedZoneBomb_C"), null);
  assert.equal(weaponIcon("Drown"), null);
});

test("gives an unknown or absent causer no icon rather than a wrong one", () => {
  assert.equal(weaponIcon(null), null);
  assert.equal(weaponIcon(undefined), null);
  assert.equal(weaponIcon(""), null);
  assert.equal(weaponIcon(42), null);
  assert.equal(weaponIcon("WeapSomethingShippedNextPatch_C"), null);
});

test("only ever returns a kind the frontend has a drawing for", () => {
  // The guard that keeps the two sides in step: a new kind added here without
  // a silhouette would render an empty box in the feed.
  const causers = [
    "WeapAUG_C", "WeapMk14_C", "WeapKar98k_C", "WeapVector_C", "WeapM249_C",
    "WeapSaiga12_C", "WeapDesertEagle_C", "WeapCrossbow_C", "WeapC4_C",
    "WeapGrenade_C", "ProjMolotov_C", "PlayerMale_A_C", "WeapPan_C",
    "BP_CoupeRB_C", "BlueZone", null,
  ];
  for (const causer of causers) {
    const kind = weaponIcon(causer);
    assert.ok(kind === null || ICON_KINDS.includes(kind), `${causer} -> ${kind}`);
  }
});

// Found by running this classifier over a real 25,565-event match: three guns
// and two melee weapons that exist in the game reached "other" and so drew
// nothing. The RPD was live -- it made a knock in that very match.
test("covers the weapons a real match turned up that weaponMeta had missed", () => {
  assert.equal(weaponIcon("WeapRPD_C"), "lmg");
  assert.equal(weaponIcon("WeapM79_C"), "explosive");
  // PUBG's own spelling is "Cowbar", not "Crowbar", and matching the English
  // word instead of the asset name is exactly how it went missing.
  assert.equal(weaponIcon("Item_Weapon_Cowbar_C"), "melee");
  assert.equal(weaponIcon("WeapPickaxe_C"), "melee");
});
