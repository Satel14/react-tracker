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
// Stroked, not filled. Filled, the canopy and the shrouds merge into one solid
// wedge and the thing stops reading as a parachute at all -- the gaps between
// the lines are half of what makes the shape recognisable. Three shrouds, not
// the reference's full set: at eight pixels any more of them close up into the
// solid this is avoiding.
const PARACHUTE = "M2 16 A14 14 0 0 1 30 16 M2 16 L16 30 M30 16 L16 30 M16 16 L16 30";

const DEAD = "M2 2 L30 30 M30 2 L2 30";

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
const CAR = "M2 8 L23 8 L30 13 L30 19 L23 24 L2 24 Z M4 2 L11 2 L11 30 L4 30 Z M21 2 L28 2 L28 30 L21 30 Z";

// Truck: pickups, vans, buses, UAZs, the BRDM. 1813 samples across 8 matches,
// second only to the car -- which makes car-vs-truck the pair most likely to
// collapse, since both are four-wheeled boxes. One cue is not enough at 8 px,
// so it is separated on three at once: the mass sits at ONE end (a single rear
// axle) where the car has a block at each, the nose is a blunt step out to a
// flat face where the car tapers to a wedge, and the cargo box is parallel-
// sided and 18 deep against the car's narrowing 16. Even and pointed against
// back-heavy and square; nothing about it has to be resolved to tell them apart.
const TRUCK = "M2 7 L22 7 L22 25 L2 25 Z M20 12 L30 12 L30 20 L20 20 Z M3 2 L11 2 L11 30 L3 30 Z";

// Bike: motorcycles and bicycles, 312 samples. The car's trick inverted -- the
// handlebars are the only thing reaching the box edges, so the 28-unit box is
// filled while the hull stays a 6-unit hairline. It carries well under half the
// car's ink and that is the read: the bike is the light one.
const BIKE = "M2 13 L25 13 L30 15 L30 17 L25 19 L2 19 Z M21 2 L25 2 L25 30 L21 30 Z";

// Boat: 5 samples across 8 matches, and still worth a glyph, because when it
// happens it is on water where nothing else is. A sharp wedge of a hull with a
// broad square transom, and the transom is what keeps it off the moving dart:
// the dart is at its NARROWEST at the back and the boat at its widest, with the
// transom standing 6 units proud of the hull on each side -- the same proudness
// the car's axles have, which is what survives the halo at r = 4.
const BOAT = "M30 16 L8 24 L8 8 Z M2 2 L10 2 L10 30 L2 30 Z";

// Aircraft: fuselage tapering to a nose at +x, one wing bar across it, a
// shorter tailplane at the back.
const PLANE = "M30 16 L22 21 L2 20 L2 12 L22 11 Z M11 2 L19 2 L19 30 L11 30 Z M2 8 L7 8 L7 24 L2 24 Z";

// Rescue balloon: from directly above, a canopy -- four lobes bulging off a
// 14-unit square, which reads as a canopy rather than as the plain disc a
// circle would collide with.
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
  parachuteFocal: { key: "focal", fallback: "rgb(255,255,255)", stroke: 3 },
  parachuteEnemy: { key: "enemy", fallback: "rgb(255,255,255)", stroke: 3 },
  knockedFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  knockedEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  vehicleFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  vehicleEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  bikeFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  bikeEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  truckFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  truckEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  boatFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  boatEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  planeFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  planeEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  balloonFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  balloonEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  dead: { key: "dead", fallback: "rgb(150,150,150)", stroke: 4 },
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
const TEAM_SAT = 85;
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
  return `hsl(${hue.toFixed(1)}, ${TEAM_SAT}%, ${light.toFixed(1)}%)`;
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
      target.drawImage(canvas, cell.sx, cell.sy, cell.sw, cell.sh, -half, -half, d, d);
      target.restore();
    },
  };
};
