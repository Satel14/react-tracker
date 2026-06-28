const COLORS = {
  focal: "#78f7a8",
  enemy: "#ffffff",
  tracer: "rgba(255,123,123,0.85)",
};

export const drawReplayFrame = (ctx, { players = [], kills = [], mapMax = 8160, size = 1000 } = {}) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  const sx = (v) => (v / mapMax) * size;

  for (const k of kills) {
    ctx.strokeStyle = COLORS.tracer;
    ctx.globalAlpha = 1 - k.age;
    ctx.lineWidth = size * 0.0025;
    ctx.beginPath();
    ctx.moveTo(sx(k.kx), sx(k.ky));
    ctx.lineTo(sx(k.vx), sx(k.vy));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const r = size * 0.006;
  for (const p of players) {
    ctx.beginPath();
    ctx.arc(sx(p.x), sx(p.y), p.isFocal ? r * 1.4 : r, 0, Math.PI * 2);
    ctx.fillStyle = p.isFocal ? COLORS.focal : COLORS.enemy;
    ctx.strokeStyle = "#0c1018";
    ctx.lineWidth = size * 0.0012;
    ctx.fill();
    ctx.stroke();
  }
};
