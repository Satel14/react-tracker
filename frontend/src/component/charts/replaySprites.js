const CELL = 32;
const KINDS = ["focal", "enemy", "dead"];

export const ICON_PATHS = {
  focal: "M16 4 L27 27 L16 21 L5 27 Z",
  enemy: "M16 6 A10 10 0 1 0 16 26 A10 10 0 1 0 16 6 Z",
  dead: "M8 8 L24 24 M24 8 L8 24",
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
