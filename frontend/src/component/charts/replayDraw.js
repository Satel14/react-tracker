const COLORS = {
  focal: "#78f7a8",
  enemy: "#ffffff",
  tracer: "rgba(255,123,123,0.85)",
  zoneCurrent: "rgba(90,180,255,0.9)",
  zoneNext: "rgba(255,255,255,0.55)",
};

export const drawReplayFrame = (ctx, { players = [], kills = [], zone = null, mapMax = 8160, size = 1000, focusedAccountId = null } = {}) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  const sx = (v) => (v / mapMax) * size;

  if (zone) {
    ctx.lineWidth = size * 0.002;
    ctx.strokeStyle = COLORS.zoneNext;
    ctx.beginPath();
    ctx.arc(sx(zone.wx), sx(zone.wy), Math.max(0, sx(zone.wr)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.zoneCurrent;
    ctx.beginPath();
    ctx.arc(sx(zone.bx), sx(zone.by), Math.max(0, sx(zone.br)), 0, Math.PI * 2);
    ctx.stroke();
  }

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
    const focused = focusedAccountId && p.accountId === focusedAccountId;
    const radius = focused ? r * 1.7 : p.isFocal ? r * 1.4 : r;
    ctx.beginPath();
    ctx.arc(sx(p.x), sx(p.y), radius, 0, Math.PI * 2);
    ctx.fillStyle = p.isFocal ? COLORS.focal : COLORS.enemy;
    ctx.strokeStyle = focused ? "#fde82b" : "#0c1018";
    ctx.lineWidth = focused ? size * 0.003 : size * 0.0012;
    ctx.fill();
    ctx.stroke();
  }
};
