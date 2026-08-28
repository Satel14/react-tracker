const CELL = 32;

// Each glyph is inscribed in a centred 28-unit box (a 2-unit margin off the
// 32-unit cell so antialiasing doesn't clip at the edge) so every kind reads
// as the same nominal size once blit scales the cell uniformly. A glyph that
// under-fills its box renders smaller than the radius the caller asked for --
// silently, because jsdom has no Path2D and never reaches this code. The
// bounding-box test in replaySprites.test.js is the only guard on that.
export const ICON_PATHS = {
  focal: "M16 2 L30 30 L16 23 L2 30 Z",
  enemy: "M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 Z",
  dead: "M2 2 L30 30 M30 2 L2 30",
  // Ring: the outer circle is enemy's, the inner one is wound the other way
  // (sweep 1 against sweep 0) so the nonzero fill punches it out as a hole.
  knocked: "M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 Z M16 8 A8 8 0 1 1 16 24 A8 8 0 1 1 16 8 Z",
  // Car in profile, one closed outline: hood, cabin, boot, then the bottom
  // edge running back with a half-circle dropped under each wheel.
  vehicle: "M2 14 L8 14 L11 2 L21 2 L24 14 L30 14 L30 26 L27 26 A4 4 0 0 1 19 26 L13 26 A4 4 0 0 1 5 26 L2 26 Z",
  crate: "M2 2 L30 2 L30 30 L2 30 Z M16 2 L16 30",
  chevron: "M2 2 L16 16 L30 2 M2 16 L16 30 L30 16",
};

const KINDS = Object.keys(ICON_PATHS);

// Which palette entry each glyph paints with, and how. `key` indexes the
// caller's colors object -- never a literal here, since the colour policy
// ratchet reads this file. `fallback` only ever paints when no stylesheet
// resolved the token. knocked and vehicle reuse the player colours rather
// than claiming their own: a knocked player is still the same player.
const PAINT = {
  focal: { key: "focal", fallback: "rgb(255,255,255)" },
  enemy: { key: "enemy", fallback: "rgb(255,255,255)" },
  knocked: { key: "enemy", fallback: "rgb(255,255,255)" },
  vehicle: { key: "focal", fallback: "rgb(255,255,255)" },
  dead: { key: "dead", fallback: "rgb(150,150,150)", stroke: 4 },
  // Round joins bound the ink at half a line width past the path. A mitre
  // spikes further: the chevron's lower vertex would tip ~0.8 units outside
  // the cell and be clipped, and the crate's corners would sit exactly on it.
  crate: { key: "crate", fallback: "rgb(255,196,74)", stroke: 4, join: "round" },
  chevron: { key: "flight", fallback: "rgb(120,180,255)", stroke: 4, join: "round" },
};

export const buildAtlas = ({ dpr = 1, colors = {} } = {}) => {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const canvas = document.createElement("canvas");
  const size = Math.round(CELL * dpr);
  canvas.width = size * KINDS.length;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const cells = {};
  KINDS.forEach((kind, i) => {
    const path = new Path2D(ICON_PATHS[kind]);
    const paint = PAINT[kind];
    const colour = colors[paint.key] || paint.fallback;
    ctx.save();
    ctx.translate(i * size, 0);
    ctx.scale(size / CELL, size / CELL);
    if (paint.stroke) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = paint.stroke;
      if (paint.join) {
        ctx.lineJoin = paint.join;
        ctx.lineCap = paint.join;
      }
      ctx.stroke(path);
    } else {
      ctx.fillStyle = colour;
      ctx.fill(path);
    }
    ctx.restore();
    cells[kind] = { sx: i * size, sy: 0, sw: size, sh: size };
  });

  return {
    blit(target, kind, x, y, r) {
      const cell = cells[kind] || cells.enemy;
      const d = r * 2;
      target.drawImage(canvas, cell.sx, cell.sy, cell.sw, cell.sh, x - r, y - r, d, d);
    },
  };
};
