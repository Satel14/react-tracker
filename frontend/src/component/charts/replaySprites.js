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

const DEAD = "M2 2 L30 30 M30 2 L2 30";

// Ring: the outer circle is the disc's, the inner one is wound the other way
// (sweep 1 against sweep 0) so the nonzero fill punches it out as a hole.
const KNOCKED = "M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 Z M16 8 A8 8 0 1 1 16 24 A8 8 0 1 1 16 8 Z";

// The map is a straight-down view, so the vehicles are drawn from straight
// down too -- the old side-on car was the wrong projection on it. All three
// point +x like the dart, so one rotation convention covers every glyph.
// Subpaths overlap deliberately and are all wound the same way: the halo pass
// strokes each of them, then one fill covers every halo segment that fell
// inside the union, leaving the halo tracing only the outer silhouette.

// Car: a 16-unit hull with a tapered nose, straddled by two axle blocks that
// reach the full width of the box. The hull alone would have to be square to
// fill the box, and a square hull is not a car; the axles are what let it stay
// long and thin.
const CAR = "M2 8 L23 8 L30 13 L30 19 L23 24 L2 24 Z M4 2 L11 2 L11 30 L4 30 Z M21 2 L28 2 L28 30 L21 30 Z";

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
  dead: DEAD,
  knockedFocal: KNOCKED,
  knockedEnemy: KNOCKED,
  vehicleFocal: CAR,
  vehicleEnemy: CAR,
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

// LogPlayerPosition's vehicle.vehicleType, as measured on live matches:
// WheeledVehicle (cars, and BP_Motorbike_04_C bikes), TransportAircraft (the
// drop plane), EmergencyPickup (the rescue balloon) and Mortar. Only two of
// them earn a glyph of their own. The backend resolves the string to bits 2-3
// of the track's flag byte before it reaches here -- 0 ground, 1 aircraft,
// 2 balloon -- so this switches on that code, never on the name. Anything
// else, including whatever PUBG ships next patch, rides as a car rather than
// falling through to a player marker.
export const vehicleGlyph = (vehicleCode, isFocal) => {
  const team = isFocal ? "Focal" : "Enemy";
  if (vehicleCode === 1) return `plane${team}`;
  if (vehicleCode === 2) return `balloon${team}`;
  return `vehicle${team}`;
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
  knockedFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  knockedEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  vehicleFocal: { key: "focal", fallback: "rgb(255,255,255)" },
  vehicleEnemy: { key: "enemy", fallback: "rgb(255,255,255)" },
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

// The halo has to sit outside whatever the colour pass puts down, so a stroked
// glyph needs its own width plus HALO on each side; a filled one needs HALO on
// each side of the path and lets the fill cover the inner half.
const haloWidth = (paint) => (paint.stroke || 0) + HALO * 2;

export const buildAtlas = ({ dpr = 1, colors = {} } = {}) => {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const canvas = document.createElement("canvas");
  const size = Math.round(CELL_BOX * dpr);
  canvas.width = size * KINDS.length;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const outline = colors.outline || OUTLINE_FALLBACK;
  const scale = size / CELL_BOX;
  const cells = {};
  KINDS.forEach((kind, i) => {
    const path = new Path2D(ICON_PATHS[kind]);
    const paint = PAINT[kind];
    const colour = colors[paint.key] || paint.fallback;
    ctx.save();
    // PAD shifts the 32-unit design box into the middle of the padded cell, so
    // the halo has the same room on every side.
    ctx.translate(i * size + PAD * scale, PAD * scale);
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
    cells[kind] = { sx: i * size, sy: 0, sw: size, sh: size };
  });

  return {
    // `angle` is a movement bearing in radians, screen space, +x at 0 -- the
    // same frame every glyph is drawn in. Omitting it draws the cell upright,
    // which is what every caller that has no bearing to give should do; 0 is a
    // real heading (due east) and rotating by it is a no-op either way.
    blit(target, kind, x, y, r, angle) {
      const cell = cells[kind] || cells.enemy;
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
