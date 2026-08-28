const CELL = 32;
const KINDS = ["focal", "enemy", "dead"];

// Each glyph is inscribed in a centred 28-unit box (a 2-unit margin off the
// 32-unit cell so antialiasing doesn't clip at the edge) so the three kinds
// read as the same nominal size once blit scales the cell uniformly.
export const ICON_PATHS = {
  focal: "M16 2 L30 30 L16 23 L2 30 Z",
  enemy: "M16 2 A14 14 0 1 0 16 30 A14 14 0 1 0 16 2 Z",
  dead: "M2 2 L30 30 M30 2 L2 30",
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
    ctx.save();
    ctx.translate(i * size, 0);
    ctx.scale(size / CELL, size / CELL);
    if (kind === "dead") {
      ctx.strokeStyle = colors.dead || "rgb(150,150,150)";
      ctx.lineWidth = 4;
      ctx.stroke(path);
    } else {
      ctx.fillStyle = (kind === "focal" ? colors.focal : colors.enemy) || "rgb(255,255,255)";
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
