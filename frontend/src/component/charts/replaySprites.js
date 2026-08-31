const CELL = 32;

// Each glyph is inscribed in a centred 28-unit box (a 2-unit margin off the
// 32-unit cell so antialiasing doesn't clip at the edge) so every kind reads
// as the same nominal size once blit scales the cell uniformly. A glyph that
// under-fills its box renders smaller than the radius the caller asked for --
// silently, because jsdom has no Path2D and never reaches this code. The
// bounding-box test in replaySprites.test.js is the only guard on that.

// Every glyph is painted twice: a dark halo first, the team colour on top.
// The map under the markers is photographic -- pale sand on Miramar, dark
// forest on Erangel, white snow on Vikendi -- so any single flat colour
// disappears into one of them, and a near-white enemy dot on sand was the
// worst of it. HALO is the visible width of that halo in design units. blit
// maps 32 units onto 2r and the scene blits at r = 4..8, so 3 units lands
// between 0.75 and 1.5 CSS px: enough to cut the glyph out of the terrain at
// every radius, small enough that the notches in the car and the plane are
// still open at the smallest.
const HALO = 3;

// A stroked halo puts ink half a line width OUTSIDE the path, and the 2-unit
// inscription margin cannot absorb it: the widest halo here is a 4-unit
// stroke plus HALO on each side, so 5 units sit past the glyph box. The
// alternative -- shrinking the drawing transform to fit the halo inside the
// 32-unit cell -- would make every marker on the map smaller than it is
// today, which nobody asked for. So the cell is padded by exactly those 5
// units instead and blit scales the padded cell up to compensate: the 32-unit
// design box still lands on the caller's 2r, unchanged, and the halo hangs
// outside it. That leaves the original 2-unit antialias margin intact for the
// stroked glyphs and 4 units for the filled ones.
const PAD = 5;
const CELL_BOX = CELL + PAD * 2;

// A state is a shape; a team is a colour. Every state therefore ships one cell
// per team rather than one cell each: the atlas bakes its colour in at raster
// time, so a single "knocked" cell would have to pick a side and would flip a
// knocked teammate to the enemy colour the instant they go down -- inverting
// the one distinction the map exists to show. There is deliberately no
// team-less spelling of any of these for a caller to reach for.

// Standing still: a plain disc. Telemetry carries no facing angle, so a marker
// for a player who is not moving must have no point and no axis -- anything
// that looks like a direction is a direction we do not have.
const STILL = "M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 Z";

// Moving: a dart with its tip at (30 16), i.e. pointing +x, so blit's rotation
// by the sampler's atan2(dy, dx) aims it along the bearing with no offset. Its
// four vertices sit 14 to 16 units from the centre, so a rotated dart sweeps
// nearly the same circle as the disc and a player who stops does not appear to
// change size.
const MOVING = "M30 16 L8 2 L2 16 L8 30 Z";

// Under canopy, between leaving the plane and touching down. Every one of the
// 475 players measured across 8 matches passes through this state and it is 5%
// of all position samples, so it is a first-class state, not an edge case: an
// eight-gore canopy seen from straight down, spiked at the suspension lines and
// pulled in between them. What it has to beat is its two neighbours -- it is
// neither the solid disc of a player standing still nor the smooth kite of one
// running -- and it beats them on ink as much as on outline: eight points at
// radius 14 over valleys at radius 6 colour in about 42% of the disc's area, so
// an airborne marker reads lighter than a planted one even where the shape
// itself is only a few pixels across.
//
// Deliberately NOT aimed, by shape rather than by rule. The scene aims every
// The universally read parachute: a canopy over converging lines, seen from
// the side. Traced from the silhouette of the icon the user pointed at rather
// than embedding that PNG -- a raster carries baked colours, and every marker
// here has to take its team's, which a path gets for free along with the halo
// and the inscription. The gores and the individual suspension lines in the
// original vanish at the 8-16 px this blits at; the outline is what survives.
//
// This one has an up, so unlike every other glyph it must NOT be turned by the
// bearing. drawScene excludes it explicitly.
// Stroked, not filled: filled, the canopy and the shrouds merge into one solid
// wedge and it stops reading as a parachute at all.
//
// Four shrouds, fanning from the canopy rim rather than all from its corners.
// Two of them was the complaint, and the reason two was all that showed is the
// halo: at stroke 3 the dark band is another 3 units on each side, so lines
// closer together than about 9 units merge into a blob before they separate.
// That sets both numbers below -- the stroke is thinner than the other line
// glyphs, and the caller draws this one larger, so the fan has room to read.
const PARACHUTE = "M2 16 A14 14 0 0 1 30 16"
  + " M2 16 L16 30 M11 16.9 L16 30 M21 16.9 L16 30 M30 16 L16 30";

// Traced from the map markers PUBG's own replay tools draw, thresholded on
// luminance rather than alpha: these are a light body with the detail --
// wheels, windows, eye sockets -- drawn into it in black, so masking on
// alpha alone flattens a car into an unrecognisable blob. The dark linework
// falls outside the mask and comes back as holes with the opposite winding,
// which a nonzero fill punches out. Inscribed in the same 28-unit box as
// every hand-drawn glyph here.
const DEAD = "M11.92 2 L18.92 2 L18.92 3.17 L21.25 3.17 L21.25 4.33 L23.58 4.33 L23.58 5.5 L24.75 5.5 L24.75 6.67 L25.92 6.67 L25.92 9 L27.08 9 L27.08 12.5 L28.25 12.5 L28.25 16 L27.08 16 L27.08 20.67 L25.92 20.67 L25.92 24.17 L22.42 24.17 L22.42 25.33 L21.25 25.33 L21.25 27.67 L20.08 27.67 L20.08 30 L10.75 30 L10.75 27.67 L9.58 27.67 L9.58 25.33 L8.42 25.33 L8.42 24.17 L4.92 24.17 L4.92 19.5 L3.75 19.5 L3.75 9 L4.92 9 L4.92 6.67 L6.08 6.67 L6.08 5.5 L7.25 5.5 L7.25 4.33 L9.58 4.33 L9.58 3.17 L11.92 3.17 Z M11.92 13.67 L10.75 13.67 L10.75 14.83 L8.42 14.83 L8.42 17.17 L7.25 17.17 L7.25 19.5 L8.42 19.5 L8.42 20.67 L11.92 20.67 L11.92 19.5 L13.08 19.5 L13.08 14.83 L11.92 14.83 Z M20.08 13.67 L18.92 13.67 L18.92 14.83 L17.75 14.83 L17.75 19.5 L18.92 19.5 L18.92 20.67 L22.42 20.67 L22.42 19.5 L23.58 19.5 L23.58 17.17 L22.42 17.17 L22.42 14.83 L20.08 14.83 Z M14.25 20.67 L14.25 23 L16.58 23 L16.58 20.67 Z";

// Ring: the outer circle is the disc's, the inner one is wound the other way
// (sweep 1 against sweep 0) so the nonzero fill punches it out as a hole.
const KNOCKED = "M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 Z M16 8 A8 8 0 1 1 16 24 A8 8 0 1 1 16 8 Z";

// The map is a straight-down view, so the vehicles are drawn from straight
// down too -- the old side-on car was the wrong projection on it. Every one of
// them points +x like the dart, so one rotation convention covers every glyph.
// Subpaths overlap deliberately -- they are never merely butted edge to edge,
// which leaves an antialiased seam down the join -- and are all wound the same
// way: the halo pass strokes each of them, then one fill covers every halo
// segment that fell inside the union, leaving the halo tracing only the outer
// silhouette.
//
// At the 8-16 px these blit at, the silhouette CLASS is the whole read -- long
// or blocky, pointed or blunt, and where the mass sits along the hull. Detail
// below about 4 units is halo food. So the five rides are separated by where
// their full-height blocks are, which is the coarsest cue available:
//
//   car    tapered nose, a block at EACH end          even, pointed
//   truck  blunt stepped nose, ONE block at the rear  back-heavy, square
//   bike   one thin block at the FRONT, hairline hull light
//   boat   one block at the very rear, wedge hull     widest where a dart is thinnest
//   plane  a thick block amidships plus a short tail  winged

// Car: a 16-unit hull with a tapered nose, straddled by two axle blocks that
// reach the full width of the box. The hull alone would have to be square to
// fill the box, and a square hull is not a car; the axles are what let it stay
// long and thin.
const CAR = "M14.13 9.47 L23.47 9.47 L23.47 10.4 L25.33 10.4 L25.33 11.33 L26.27 11.33 L26.27 12.27 L27.2 12.27 L27.2 14.13 L28.13 14.13 L28.13 15.07 L29.07 15.07 L29.07 18.8 L30 18.8 L30 19.73 L29.07 19.73 L29.07 20.67 L26.27 20.67 L26.27 21.6 L25.33 21.6 L25.33 22.53 L24.4 22.53 L24.4 21.6 L22.53 21.6 L22.53 20.67 L12.27 20.67 L12.27 21.6 L9.47 21.6 L9.47 20.67 L8.53 20.67 L8.53 21.6 L7.6 21.6 L7.6 22.53 L5.73 22.53 L5.73 21.6 L4.8 21.6 L4.8 19.73 L3.87 19.73 L3.87 20.67 L2.93 20.67 L2.93 19.73 L2 19.73 L2 18.8 L2.93 18.8 L2.93 15.07 L5.73 15.07 L5.73 14.13 L10.4 14.13 L10.4 12.27 L11.33 12.27 L11.33 11.33 L12.27 11.33 L12.27 10.4 L14.13 10.4 Z M13.2 11.33 L13.2 12.27 L12.27 12.27 L12.27 14.13 L24.4 14.13 L24.4 13.2 L23.47 13.2 L23.47 11.33 L18.8 11.33 L18.8 12.27 L16.93 12.27 L16.93 11.33 Z M5.73 17.87 L4.8 17.87 L4.8 18.8 L5.73 18.8 Z M9.47 18.8 L8.53 18.8 L8.53 19.73 L9.47 19.73 Z";

// Truck: pickups, vans, buses, UAZs, the BRDM. 1813 samples across 8 matches,
// second only to the car -- which makes car-vs-truck the pair most likely to
// collapse, since both are four-wheeled boxes.
//
// It used to be separated from the car on three drawn cues at once: one rear
// axle against the car's two, a blunt nose against a tapered one, a deeper
// cargo box. Measured, all three together were worth nothing: the two covered
// 74% of each other, and the boat's wedge sat ENTIRELY inside this box. The
// reason is the inscription rule -- every glyph fills the same 28-unit square,
// so two solid glyphs must overlap most of it however their edges are drawn,
// and no amount of redrawing an outline escapes that. See the separation test.
//
// So this one stops being solid. Hollow is the one channel a filled glyph
// cannot follow it into: the cargo box is a ring, and the ink drops to the
// walls. Against the car that is 0.74 -> 0.29, against the boat 0.70 -> 0.24.
//
// The nose bar is not decoration. A closed rectangle looks the same turned
// through 90, 180 and 270 degrees, and the scene turns every moving marker to
// its bearing, so a bare box would have thrown away the heading every other
// vehicle here reads out. The bar is what says which end is the front.
// One car for every car. A van and a sedan are the same thing to a reader
// following a fight, and two silhouettes that mean the same thing cost
// more to tell apart than they are worth.
const TRUCK = CAR;

// Bike: motorcycles and bicycles, 312 samples. The car's trick inverted -- the
// handlebars are the only thing reaching the box edges, so the 28-unit box is
// filled while the hull stays a 6-unit hairline. It carries well under half the
// car's ink and that is the read: the bike is the light one.
const BIKE = "M8.53 7.6 L12.27 7.6 L12.27 9.47 L14.13 9.47 L14.13 8.53 L15.07 8.53 L15.07 9.47 L17.87 9.47 L17.87 10.4 L18.8 10.4 L18.8 12.27 L22.53 12.27 L22.53 11.33 L23.47 11.33 L23.47 10.4 L29.07 10.4 L29.07 11.33 L30 11.33 L30 14.13 L28.13 14.13 L28.13 15.07 L25.33 15.07 L25.33 16 L27.2 16 L27.2 16.93 L29.07 16.93 L29.07 18.8 L30 18.8 L30 21.6 L29.07 21.6 L29.07 23.47 L28.13 23.47 L28.13 24.4 L23.47 24.4 L23.47 23.47 L22.53 23.47 L22.53 22.53 L21.6 22.53 L21.6 21.6 L13.2 21.6 L13.2 20.67 L12.27 20.67 L12.27 17.87 L11.33 17.87 L11.33 16.93 L10.4 16.93 L10.4 23.47 L9.47 23.47 L9.47 24.4 L3.87 24.4 L3.87 23.47 L2.93 23.47 L2.93 21.6 L2 21.6 L2 19.73 L2.93 19.73 L2.93 17.87 L3.87 17.87 L3.87 16.93 L4.8 16.93 L4.8 16 L8.53 16 L8.53 16.93 L9.47 16.93 L9.47 15.07 L8.53 15.07 L8.53 14.13 L5.73 14.13 L5.73 10.4 L6.67 10.4 L6.67 8.53 L8.53 8.53 Z M5.73 17.87 L5.73 18.8 L4.8 18.8 L4.8 19.73 L3.87 19.73 L3.87 21.6 L4.8 21.6 L4.8 22.53 L8.53 22.53 L8.53 20.67 L9.47 20.67 L9.47 19.73 L7.6 19.73 L7.6 20.67 L5.73 20.67 L5.73 19.73 L6.67 19.73 L6.67 18.8 L7.6 18.8 L7.6 17.87 Z M24.4 17.87 L24.4 18.8 L25.33 18.8 L25.33 19.73 L26.27 19.73 L26.27 21.6 L23.47 21.6 L23.47 22.53 L27.2 22.53 L27.2 21.6 L28.13 21.6 L28.13 18.8 L27.2 18.8 L27.2 17.87 Z M23.47 16 L22.53 16 L22.53 16.93 L23.47 16.93 Z";

// Boat: 5 samples across 8 matches, and still worth a glyph, because when it
// happens it is on water where nothing else is. A sharp wedge of a hull with a
// broad square transom, and the transom is what keeps it off the moving dart:
// the dart is at its NARROWEST at the back and the boat at its widest, with the
// transom standing 6 units proud of the hull on each side -- the same proudness
// the car's axles have, which is what survives the halo at r = 4.
const BOAT = "M16 11 L17 11 L17 14 L19 14 L19 15 L25 15 L25 16 L29 16 L29 19 L30 19 L30 21 L7 21 L7 20 L6 20 L6 19 L5 19 L5 18 L4 18 L4 16 L3 16 L3 15 L2 15 L2 14 L12 14 L12 13 L14 13 L14 12 L16 12 Z";

// Aircraft: fuselage tapering to a nose at +x, one wing bar across it, a
// shorter tailplane at the back.
const PLANE = "M15.64 6.67 L16.36 6.67 L16.36 7.38 L17.08 7.38 L17.08 12.41 L17.79 12.41 L17.79 13.13 L19.23 13.13 L19.23 11.69 L19.95 11.69 L19.95 13.13 L22.1 13.13 L22.1 12.41 L23.54 12.41 L23.54 13.13 L29.28 13.13 L29.28 13.85 L30 13.85 L30 15.28 L24.26 15.28 L24.26 16 L17.79 16 L17.79 16.72 L17.08 16.72 L17.08 21.74 L19.95 21.74 L19.95 22.46 L21.38 22.46 L21.38 23.9 L17.79 23.9 L17.79 24.62 L16.36 24.62 L16.36 25.33 L15.64 25.33 L15.64 24.62 L14.21 24.62 L14.21 23.9 L10.62 23.9 L10.62 22.46 L12.05 22.46 L12.05 21.74 L14.21 21.74 L14.21 21.03 L14.92 21.03 L14.92 20.31 L14.21 20.31 L14.21 16 L7.03 16 L7.03 15.28 L2 15.28 L2 13.85 L2.72 13.85 L2.72 13.13 L8.46 13.13 L8.46 11.69 L9.18 11.69 L9.18 13.13 L12.05 13.13 L12.05 11.69 L12.77 11.69 L12.77 13.13 L14.21 13.13 L14.21 8.82 L14.92 8.82 L14.92 7.38 L15.64 7.38 Z";

// Rescue balloon: from directly above, a canopy -- four lobes bulging off a
// 14-unit square, which reads as a canopy rather than as the plain disc a
// circle would collide with.
//
// Except that filled, it WAS that disc. The lobes cover 82% of the standing
// player's marker, which is the worst collision the map had: a rescue balloon
// and an enemy standing still are opposite things to find, and they were the
// same ink. Deepening the notches between the lobes does not fix it -- pulled
// in as far as they go, the pair only falls to 0.73, because both shapes still
// have to fill the 28-unit inscription box. Painted hollow the same outline
// falls to 0.30, and the lobes finally read as lobes rather than as a rounded
// edge. The path is untouched; only PAINT changed.
const BALLOON = "M9 9 A7 7 0 0 1 23 9 A7 7 0 0 1 23 23 A7 7 0 0 1 9 23 A7 7 0 0 1 9 9 Z";

// Airdrop: a canopy over a payload, one closed silhouette. The shrouds are a
// solid taper rather than lines and the payload touches the canopy, because
// this is blitted at r = 4 -- 8 px across -- where a line is a smudge and a
// gap closes up anyway. The square-with-a-bar it replaces read as nothing at
// that size.
const CRATE = "M2 16 A14 14 0 0 1 30 16 L26 16 L23 20 L23 30 L9 30 L9 20 L6 16 Z";

const CHEVRON = "M2 2 L16 16 L30 2 M2 16 L16 30 L30 16";

export const ICON_PATHS = {
  focal: STILL,
  enemy: STILL,
  movingFocal: MOVING,
  movingEnemy: MOVING,
  parachuteFocal: PARACHUTE,
  parachuteEnemy: PARACHUTE,
  dead: DEAD,
  knockedFocal: KNOCKED,
  knockedEnemy: KNOCKED,
  vehicleFocal: CAR,
  vehicleEnemy: CAR,
  bikeFocal: BIKE,
  bikeEnemy: BIKE,
  truckFocal: TRUCK,
  truckEnemy: TRUCK,
  boatFocal: BOAT,
  boatEnemy: BOAT,
  planeFocal: PLANE,
  planeEnemy: PLANE,
  balloonFocal: BALLOON,
  balloonEnemy: BALLOON,
  crate: CRATE,
  // A red crate is the one worth crossing the map for, and the atlas bakes one
  // colour per cell, so it needs its own.
  crateRed: CRATE,
  chevronFocal: CHEVRON,
  chevronEnemy: CHEVRON,
};

const KINDS = Object.keys(ICON_PATHS);

// LogPlayerPosition names the ride it carries, and 54 distinct vehicleIds turn
// up on position samples across 8 real matches. The backend groups them into
// the six shapes worth telling apart at marker size and packs the group into
// bits 2-4 of the track's flag byte before it reaches here, so this switches on
// that code and never on the name. Samples per group over those 8 matches:
// car 4055, plane 1860, truck 1813, bike 312, balloon 292, boat 5.
const VEHICLE_FORMS = ["vehicle", "plane", "balloon", "bike", "truck", "boat"];

// 6 and 7 are unallocated -- three bits hold eight codes -- and every other
// input, including whatever PUBG ships next patch, rides as a car rather than
// falling through to a player marker: an unfamiliar ride drawn as a car is a
// rough answer, a driver drawn as a pedestrian is a wrong one.
//
// Number.isInteger is what makes the table lookup safe: without it "length"
// indexes the array's own length and a driver blits as kind "6Focal", which is
// no cell at all.
export const vehicleGlyph = (vehicleCode, isFocal) => {
  const team = isFocal ? "Focal" : "Enemy";
  const form = (Number.isInteger(vehicleCode) && VEHICLE_FORMS[vehicleCode]) || VEHICLE_FORMS[0];
  return `${form}${team}`;
};

// Which palette entry each glyph paints with, and how. `key` indexes the
// caller's colors object -- never a literal here, since the colour policy
// ratchet reads this file. `fallback` only ever paints when no stylesheet
// resolved the token, and is deliberately not a copy of any token value. The
// state glyphs claim no colour of their own: each variant takes the team
// colour its name carries, so a player keeps their side when they go down,
// mount up or start running.
const PAINT = {
  focal: { key: "focal", fallback: "rgb(255,255,255)" },
  enemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  movingFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  movingEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  parachuteFocal: { key: "focal", fallback: "rgb(255,255,255)", stroke: 2 },
  parachuteEnemy: { key: "enemy", fallback: "rgb(255,255,255)", stroke: 2 },
  knockedFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  knockedEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  vehicleFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  vehicleEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  bikeFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  bikeEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  // Hollow, and the widest wall on the sheet: the cargo ring is the largest
  // shape here, so it can carry 4 without the box closing up at the 10 CSS px
  // an enemy marker blits at.
  truckFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  truckEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  boatFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  boatEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  planeFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  planeEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  // Hollow, at 3: the four lobes are the read, and a wall any thicker fills
  // the notches between them back in. The parachute's 2 would be too thin
  // here -- the scene draws the canopy at r = 9 and this at r = 5.
  balloonFocal: { key: "focal", fallback: "rgb(255,255,255)", stroke: 3 },
  balloonEnemy: { key: "enemy", fallback: "rgb(255,255,255)", stroke: 3 },
  dead: { key: "dead", fallback: "rgb(150,150,150)" },
  crate: { key: "crate", fallback: "rgb(255,196,74)" },
  crateRed: { key: "danger", fallback: "rgb(220,80,80)" },
  chevronFocal: { key: "focal", fallback: "rgb(120,180,255)", stroke: 4 },
  chevronEnemy: { key: "enemy", fallback: "rgb(120,180,255)", stroke: 4 },
};

// Near-black, and not any token's value: the halo has to read against snow and
// sand, and it is the one colour here that must never be mistaken for a team.
const OUTLINE_FALLBACK = "rgb(20,18,30)";

// ---------------------------------------------------------------------------
// Team colours
// ---------------------------------------------------------------------------

// A state is a shape and a team is a colour, and until now "team" meant one of
// two: yours and everyone else's. A squad lobby is 16-25 teams and the map
// carries up to a hundred markers, so that answers "is this mine" and nothing
// else. Each colour is a whole extra ROW of the atlas (see buildAtlas), which
// is what caps this list.
//
// 12. At dpr 2 a row is 84 px, so twelve colours make the sheet 1092 px tall
// against the 4096 px canvas floor the atlas is sized to stay under -- but the
// binding limit is the eye, not the canvas: a marker is 8-16 px across, and
// past a dozen hues two of them stop being tellable apart, so a 13th colour
// costs a row and buys nothing. 25 teams over 12 colours means at most three
// teams share a hue (ids 1, 13 and 25); raising this to 16 -- four more rows,
// 336 px, still far inside the limit -- would cap that at two, at the price of
// hues 4 degrees closer together.
export const TEAM_COLORS = 12;

// Colour index 0 is not a team colour: it means "paint this kind the way row 0
// paints it", which for a *Focal kind is colors.focal and for a *Enemy kind is
// colors.enemy -- exactly what the map did before teams had colours. So it is
// both the focal team's answer (requirement: the viewer's own team keeps the
// one colour nothing else can take) and the safe answer for a track whose team
// is unknown, which stays enemy-coloured rather than borrowing the focal green.
export const DEFAULT_COLOR_INDEX = 0;

// Hue arcs, in degrees, that nothing else on this map claims. The gaps between
// them are guard bands around hues read off style/_tokens.scss, not guessed:
//   ~0, ~3    --danger / --zone-red    kill tracers, the red crate, low health
//   ~25, ~39  --warn / --zone-storm    gunfire, knock marks, the dust zone
//   ~54       --brand                  the selection ring, --win, --tier-gold
//   ~143      --ok                     the focal team, and a healthy arc
//   ~255      --zone-emp               the EMP zone fill
//   ~317      --crate                  loot pins
//
// Deliberately NOT guarded, and the one collision this palette accepts: the
// cyan-to-blue band at ~193 (--flight), ~207 (the next-zone ring) and ~221
// (the outside-the-circle wash), which three of the twelve hues land within
// 1.5 degrees of. Blocking that band as well leaves 124 degrees for twelve
// colours -- 10 degrees apart, which is not a palette. And the collision is
// not the same kind: those three are hairlines and a 28%-alpha wash painted
// UNDER the markers, so a blue team dot loses a little contrast over them and
// keeps its near-black halo. Every band above is a marker-sized glyph or the
// focal read itself, where a shared hue is a wrong answer rather than a dim
// one. --rest (~233, the corpse grey) sits in the blue arc too, at 14%
// saturation against these 85%: a grey stroked cross, not a solid disc.
const HUE_ARCS = [[66, 122], [164, 242], [267, 301], [333, 348]];

const HUE_SPAN = HUE_ARCS.reduce((sum, [lo, hi]) => sum + (hi - lo), 0);

// Two jobs the golden angle normally does at once, split apart because the hue
// domain here is not a circle.
//
// Placement is EVEN across the arcs above, not golden. A golden angle spreads
// points over a full 360, where at twelve points its tightest pair is a healthy
// 20 degrees -- but half of those points land on a band above. Walk it along
// these 183 degrees in four pieces instead and the tightest pair collapses to
// 10.2; even placement maximises it at 15.25 and is what the fragmented domain
// actually wants.
//
// The spreading job moves to the index map instead. Team ids are small integers
// and the teams that fight each other are usually numerically close, so id ->
// slot steps by 7: the integer nearest 12/phi (7.42) that is coprime to 12, so
// it still cycles through all twelve. Consecutive ids land five slots apart --
// never less than 101 degrees of hue -- instead of adjacent.
const TEAM_STRIDE = 7;

// Fixed saturation, and a lightness that rises towards blue. Equal-lightness
// hues are not equally light: hsl(238,85%,55%) is a deep blue that sinks into
// a dark forest raster while hsl(74,85%,55%) is a bright lime. The tilt is one
// cosine term peaking opposite yellow, and it lands every colour between 55%
// and 71%: none dark enough to lose to forest, none pale enough to wash out on
// snow.
//
// Saturation alternates between two levels rather than being one. Hue and
// lightness alone leave the green arc tight: [66,122] holds four of the twelve
// at 15-degree steps, and the lightness tilt is nearly flat there, so colours
// 3 and 4 came out 8.2 apart in CIE Lab -- the only pair of sixty-six under
// 10, and two greens a viewer has to tell apart at a 13 px marker. Dropping
// every other entry to 72% moves the worst pair to 13.0, which is where the
// second-worst pair already sat, and it costs nothing elsewhere: the lightness
// tilt is untouched, so the blues stay measurably lighter than the yellow-
// greens. A zigzag on lightness was the obvious alternative and is worse --
// it reaches 11.2 only by eating that blue-to-yellow-green margin down to 5.1.
// The stride that maps team ids to slots is odd, so consecutive ids land on
// different levels too.
const TEAM_SAT = 85;
const TEAM_SAT_MUTED = 72;
const TEAM_LIGHT_BASE = 55;
const TEAM_LIGHT_TILT = 16;

// Walks the arcs as one contiguous ruler and reports where `offset` lands.
const hueAt = (offset) => {
  let left = offset;
  for (const [lo, hi] of HUE_ARCS) {
    const width = hi - lo;
    if (left < width) return lo + left;
    left -= width;
  }
  // Unreachable while offset < HUE_SPAN, which is how teamColor calls it. If a
  // future arc edit makes that untrue, the last arc's end is the only answer
  // still inside allowed hue space.
  return HUE_ARCS[HUE_ARCS.length - 1][1];
};

// Index -> colour. Returns null for anything that is not a team palette entry,
// index 0 included: 0 is the "kind's own colour" row and has no colour of its
// own to hand back. Never a literal -- the colour is computed, which is both
// what lets the palette scale to any cap and what keeps this file free of the
// hex the colour-policy ratchet scans for.
export const teamColor = (index) => {
  if (!Number.isInteger(index) || index < 1 || index > TEAM_COLORS) return null;
  const hue = hueAt((index - 1 + 0.5) * (HUE_SPAN / TEAM_COLORS));
  const lift = (1 - Math.cos(((hue - 60) * Math.PI) / 180)) / 2;
  const light = TEAM_LIGHT_BASE + TEAM_LIGHT_TILT * lift;
  const sat = index % 2 ? TEAM_SAT : TEAM_SAT_MUTED;
  return `hsl(${hue.toFixed(1)}, ${sat}%, ${light.toFixed(1)}%)`;
};

// Team -> index. Pure, and total: every input lands on a real row.
// `focalTeamId` is optional -- a caller that does not know which team is the
// viewer's simply gets a palette colour for everyone, rather than a thrown
// error or a silently focal-green enemy.
// Number.isFinite does not coerce, so a string id, null, undefined and NaN all
// fall to DEFAULT_COLOR_INDEX -- today's two-colour behaviour -- rather than
// hashing to an arbitrary team's colour.
export const teamColorIndex = (teamId, focalTeamId) => {
  if (!Number.isFinite(teamId)) return DEFAULT_COLOR_INDEX;
  if (Number.isFinite(focalTeamId) && teamId === focalTeamId) return DEFAULT_COLOR_INDEX;
  const slot = Math.trunc(teamId) * TEAM_STRIDE;
  return 1 + ((slot % TEAM_COLORS) + TEAM_COLORS) % TEAM_COLORS;
};

// The colour axis repaints a FORM, not a kind: movingFocal and movingEnemy are
// one dart, and that dart in team 7's colour is one cell rather than two. Each
// entry names the row-0 kind whose COLUMN the team rows reuse, so a team cell
// always sits directly under the default cell of the same shape.
//
// dead, crate, crateRed, chevronFocal and chevronEnemy are deliberately absent.
// A corpse belongs to nobody once it is one, the two crates encode contents
// rather than ownership, and the landing chevron keeps the friend/foe read it
// ships with. A colour index handed with any of them is ignored rather than
// dropping the glyph. Adding the chevron pair later costs no sheet area at all
// -- its column already exists in every row -- only 24 more rasterised passes.
const TEAM_FORM = {
  focal: "focal",
  enemy: "focal",
  movingFocal: "movingFocal",
  movingEnemy: "movingFocal",
  parachuteFocal: "parachuteFocal",
  parachuteEnemy: "parachuteFocal",
  knockedFocal: "knockedFocal",
  knockedEnemy: "knockedFocal",
  vehicleFocal: "vehicleFocal",
  vehicleEnemy: "vehicleFocal",
  bikeFocal: "bikeFocal",
  bikeEnemy: "bikeFocal",
  truckFocal: "truckFocal",
  truckEnemy: "truckFocal",
  boatFocal: "boatFocal",
  boatEnemy: "boatFocal",
  planeFocal: "planeFocal",
  planeEnemy: "planeFocal",
  balloonFocal: "balloonFocal",
  balloonEnemy: "balloonFocal",
};

const TEAM_FORM_KINDS = [...new Set(Object.values(TEAM_FORM))];

// Glyphs traced from side-view art: they have a roof and wheels, so there is a
// way up. Rotating one to a westward bearing stands it on its head, which a
// hand-drawn hull with an axle at each end never did because it was symmetric.
// Not the plane -- that is a plan view, with a nose and a tail rather than a
// roof -- and not the darts, which are symmetric about the axis they point
// along.
const SIDE_VIEW = new Set([
  "vehicleFocal", "vehicleEnemy",
  "truckFocal", "truckEnemy",
  "bikeFocal", "bikeEnemy",
  "boatFocal", "boatEnemy",
]);

// The halo has to sit outside whatever the colour pass puts down, so a stroked
// glyph needs its own width plus HALO on each side; a filled one needs HALO on
// each side of the path and lets the fill cover the inner half.
const haloWidth = (paint) => (paint.stroke || 0) + HALO * 2;

// The sheet is a grid, not a row: one column per kind, one row per colour.
//
// Row 0 is the sheet as it always was -- every kind in the colour its PAINT
// entry names -- and is what a caller that passes no colour index samples, so
// the two-colour map is bit-for-bit the row it was before. Rows 1..TEAM_COLORS
// repaint the ten player/vehicle forms in one generated team colour each, in
// the same columns their row-0 originals occupy.
//
// At dpr 2 a cell is CELL_BOX * 2 = 84 px, so the sheet is 25 * 84 = 2100 wide
// and 13 * 84 = 1092 tall, against the 4096 px conservative canvas limit: 1996
// px of width and 3004 px of height still spare. A kind costs 84 px of width
// (23 more would fit) and a colour 84 px of height (TEAM_COLORS could reach 47).
//
// The fifteen columns each team row leaves empty are transparent and never
// sampled. They cost 2100 * 1092 * 4 = 9.2 MB of backing store at dpr 2 where a
// tightly packed 145 cells would cost about 4.1; the grid is what makes a cell's
// address (column = kind, row = colour) something blit can compute rather than
// look up, and 9 MB of canvas is not the constraint here. If it ever becomes
// one, two team rows fit side by side in 25 columns and halve it.
export const buildAtlas = ({ dpr = 1, colors = {} } = {}) => {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const canvas = document.createElement("canvas");
  const size = Math.round(CELL_BOX * dpr);
  canvas.width = size * KINDS.length;
  canvas.height = size * (TEAM_COLORS + 1);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const outline = colors.outline || OUTLINE_FALLBACK;
  const scale = size / CELL_BOX;
  const column = Object.fromEntries(KINDS.map((kind, i) => [kind, i]));

  const paintCell = (kind, row, colour) => {
    const path = new Path2D(ICON_PATHS[kind]);
    const paint = PAINT[kind];
    ctx.save();
    // PAD shifts the 32-unit design box into the middle of the padded cell, so
    // the halo has the same room on every side.
    ctx.translate(column[kind] * size + PAD * scale, row * size + PAD * scale);
    ctx.scale(scale, scale);
    // Round joins and caps on both passes bound the ink at exactly half a line
    // width past the path, which is what PAD is sized against. A mitre spikes
    // further: the chevron's lower vertex would tip outside the cell.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = outline;
    ctx.lineWidth = haloWidth(paint);
    ctx.stroke(path);
    if (paint.stroke) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = paint.stroke;
      ctx.stroke(path);
    } else {
      ctx.fillStyle = colour;
      ctx.fill(path);
    }
    ctx.restore();
    return { sx: column[kind] * size, sy: row * size, sw: size, sh: size };
  };

  // rows[0] is keyed by every kind; rows[1..] only by the ten team forms. Both
  // are null-prototype: blit looks a caller-supplied string up in them, and on
  // a plain object "toString" and "constructor" answer truthily with something
  // that is not a cell.
  const rows = [Object.create(null)];
  KINDS.forEach((kind) => {
    const paint = PAINT[kind];
    rows[0][kind] = paintCell(kind, 0, colors[paint.key] || paint.fallback);
  });
  for (let ci = 1; ci <= TEAM_COLORS; ci += 1) {
    const colour = teamColor(ci);
    const row = Object.create(null);
    for (const kind of TEAM_FORM_KINDS) row[kind] = paintCell(kind, ci, colour);
    rows.push(row);
  }
  const base = rows[0];

  return {
    // `angle` is a movement bearing in radians, screen space, +x at 0 -- the
    // same frame every glyph is drawn in. Omitting it draws the cell upright,
    // which is what every caller that has no bearing to give should do; 0 is a
    // real heading (due east) and rotating by it is a no-op either way.
    //
    // `colorIndex` is appended last, after the already-optional `angle`, so a
    // caller that passes six arguments keeps the exact two-colour behaviour it
    // had: undefined is falsy, lands on row 0, and row 0 is the old sheet.
    // Take it from teamColorIndex(teamId, focalTeamId). Anything that is not a
    // live team row -- 0, a negative, a fraction, NaN, a value past the cap --
    // degrades to row 0 and still draws the glyph; a missing colour must never
    // mean a missing marker. A kind with no team form (dead, the crates, the
    // chevrons) ignores it the same way.
    blit(target, kind, x, y, r, angle, colorIndex) {
      // Resolved once, so the colour row is looked up under the same name the
      // shape came from: an unknown kind is an enemy dot in row 0 and the same
      // team's dot in a colour row, never a hole in one and a glyph in the
      // other.
      const known = base[kind] ? kind : "enemy";
      let cell = base[known];
      // A range check rather than a truthiness one: rows is an Array, so a
      // stray string index would otherwise reach its prototype.
      if (colorIndex >= 1 && colorIndex <= TEAM_COLORS) {
        const row = rows[colorIndex];
        const form = TEAM_FORM[known];
        if (row && form) cell = row[form];
      }
      // The cell is CELL_BOX units wide but only its inner CELL units are the
      // design box, so the destination is scaled up by the same ratio to keep
      // the glyph itself exactly 2r across. The halo is what hangs outside.
      const d = (2 * r * CELL_BOX) / CELL;
      const half = d / 2;
      if (!angle) {
        target.drawImage(canvas, cell.sx, cell.sy, cell.sw, cell.sh, x - half, y - half, d, d);
        return;
      }
      target.save();
      target.translate(x, y);
      target.rotate(angle);
      // Turned to the bearing, then mirrored about its own long axis when that
      // bearing points into the left half-plane. cos(angle) < 0 is exactly the
      // set of headings that would put the roof below the wheels. The mirror
      // is on the local y axis, so the nose still points where the player is
      // going -- only the up/down of the art is flipped back.
      if (SIDE_VIEW.has(known) && Math.cos(angle) < 0) target.scale(1, -1);
      target.drawImage(canvas, cell.sx, cell.sy, cell.sw, cell.sh, -half, -half, d, d);
      target.restore();
    },
  };
};
