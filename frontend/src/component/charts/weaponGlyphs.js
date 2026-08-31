// Weapon silhouettes for the kill feed, one per class the backend's
// weaponIcon classifier can return.
//
// Classes, not individual guns. PUBG's own icons are its assets and cannot be
// shipped, and sixty-two hand-drawn guns would not be told apart at the size
// these are read at anyway -- a line of 12px text. The exact gun stays in the
// line's title and its accessible name, so nothing is lost, only moved.
//
// Filled paths only, M/L/Z, on one box. Fills rather than strokes because a
// silhouette is what survives being scaled down, and because a single fill
// takes the feed's currentColor without a second paint rule.

export const GLYPH_BOX = Object.freeze({ w: 40, h: 16 });

export const WEAPON_GLYPHS = Object.freeze({
  // One anatomy across every firearm, so they read as a family: a thin barrel
  // along y5-7, a deeper receiver under its back half, a thin stock with a
  // taller butt plate, and below the receiver a magazine raking forward
  // against a grip raking back. That opposed rake is what stops the pair
  // reading as two legs -- drawn the same way they merge into an animal.
  ar:
    "M0 5 L17 5 L17 7 L0 7 Z M5 3 L7 3 L7 5 L5 5 Z M16 5 L28 5 L28 11 L16 11 Z "
    + "M28 6 L38 6 L38 9 L28 9 Z M36 5 L39 5 L39 11 L36 11 Z "
    + "M22 11 L26 11 L27 16 L23 16 Z M16 11 L20 11 L17 16 L13 16 Z",

  // Optics wider than the receiver, mounted high. That slab is ink no
  // unscoped class has anywhere, and it is the whole separation from the AR.
  dmr:
    "M13 0 L32 0 L32 4 L13 4 Z M20 4 L25 4 L25 6 L20 6 Z M1 5 L18 5 L18 7 L1 7 Z "
    + "M17 5 L29 5 L29 11 L17 11 Z M29 6 L38 6 L38 9 L29 9 Z M36 5 L39 5 L39 11 L36 11 Z "
    + "M22 11 L26 11 L27 16 L23 16 Z M17 11 L21 11 L21 15 L17 15 Z",

  // The longest barrel, glass sat lower and narrower than a DMR's, a bolt
  // behind it, a stock deep enough to shoulder, and almost no magazine --
  // which is the cue that survives when the two scopes look alike.
  sr:
    "M0 6 L19 6 L19 8 L0 8 Z M12 2 L26 2 L26 5 L12 5 Z M27 3 L31 3 L31 6 L27 6 Z "
    + "M18 6 L29 6 L29 11 L18 11 Z M29 6 L39 6 L39 14 L29 14 Z "
    + "M21 11 L25 11 L26 16 L22 16 Z",

  // Barely any barrel, a skeleton stock with no butt at all, and a magazine
  // that runs off the bottom of the box.
  smg:
    "M14 6 L19 6 L19 8 L14 8 Z M17 6 L28 6 L28 11 L17 11 Z M28 8 L38 8 L38 9 L28 9 Z "
    + "M23 11 L27 11 L28 16 L24 16 Z M17 11 L21 11 L21 16 L17 16 Z",

  // Bipod under the barrel and a box as deep as the receiver under that.
  lmg:
    "M2 5 L18 5 L18 7 L2 7 Z M4 7 L7 7 L3 16 L0 16 Z M5 7 L8 7 L12 16 L9 16 Z "
    + "M16 4 L29 4 L29 11 L16 11 Z M15 11 L27 11 L27 16 L15 16 Z "
    + "M29 6 L38 6 L38 9 L29 9 Z M36 5 L39 5 L39 11 L36 11 Z",

  // A fat barrel with a pump slung under it, a stock running straight through
  // from the receiver, and nothing hanging below: no magazine to draw.
  shotgun:
    "M1 4 L20 4 L20 7 L1 7 Z M5 7 L14 7 L14 10 L5 10 Z M18 4 L27 4 L27 11 L18 11 Z "
    + "M27 5 L39 5 L39 11 L27 11 Z M22 11 L26 11 L27 15 L23 15 Z",

  // Half the box empty. Nothing else in the set leaves the left third bare.
  pistol:
    "M12 4 L30 4 L30 8 L12 8 Z M10 5 L12 5 L12 7 L10 7 Z M22 8 L28 8 L31 16 L25 16 Z",

  // Limbs opening to the left, which no firearm in the set does.
  crossbow:
    "M2 1 L5 1 L16 8 L14 9 Z M2 15 L5 15 L16 8 L14 7 Z M12 7 L34 7 L34 9 L12 9 Z "
    + "M30 5 L38 5 L38 12 L30 12 Z M23 9 L27 9 L26 14 L22 14 Z",

  // A frag: fat body, neck, and the spoon down its side.
  explosive:
    "M14 10 L16 6 L20 5 L24 6 L26 10 L24 14 L20 15 L16 14 Z M18 2 L22 2 L22 5 L18 5 Z "
    + "M22 2 L28 2 L28 4 L22 4 Z M26 2 L28 2 L28 10 L26 10 Z",

  // A pan: the only round thing with a handle.
  melee:
    "M6 9 L8 5 L13 2 L18 5 L20 9 L18 13 L13 16 L8 13 Z M19 7 L38 7 L38 10 L19 10 Z",

  // A fist and a forearm, knuckles to the right.
  fists:
    "M0 7 L9 7 L9 12 L0 12 Z M9 4 L22 4 L24 7 L24 13 L22 16 L9 16 Z "
    + "M12 2 L18 2 L18 5 L12 5 Z M24 6 L27 6 L27 8 L24 8 Z "
    + "M24 9 L28 9 L28 11 L24 11 Z M24 12 L27 12 L27 14 L24 14 Z",

  // A car from the side, wheels below the sill.
  vehicle:
    "M3 8 L37 8 L37 12 L3 12 Z M11 3 L27 3 L30 8 L8 8 Z "
    + "M8 11 L14 11 L14 15 L8 15 Z M26 11 L32 11 L32 15 L26 15 Z",
});

export default WEAPON_GLYPHS;
