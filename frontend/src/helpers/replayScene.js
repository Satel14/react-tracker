import { worldToScreen, scaleOf } from "./replayCamera";
import { STATE } from "./replayTracks";

export const SCREEN = {
  dotRadius: 5,
  focalRadius: 7,
  selectedRadius: 8,
  zoneWidth: 1.5,
  tracerWidth: 2,
  ringWidth: 2,
  labelFont: "600 11px system-ui, sans-serif",
  labelOffset: 12,
  flashLifetimeMs: 1200,
};

export const drawBackground = (ctx, { cam, vw, vh, image, bandColor }) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = bandColor;
  ctx.fillRect(0, 0, vw, vh);
  if (!image) return;
  const p0 = worldToScreen(cam, vw, vh, 0, 0);
  const side = cam.mapMax * scaleOf(cam, vw, vh);
  ctx.drawImage(image, p0.x, p0.y, side, side);
};

const drawZone = (ctx, { cam, vw, vh, zone, colors }) => {
  if (!zone) return;
  const s = scaleOf(cam, vw, vh);
  const cur = worldToScreen(cam, vw, vh, zone.bx, zone.by);
  const curR = Math.max(0, zone.br * s);

  // Everything outside the current circle is gassed: one even-odd path so the
  // circle is a hole rather than a second fill.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, vw, vh);
  ctx.arc(cur.x, cur.y, curR, 0, Math.PI * 2);
  ctx.fillStyle = colors.outside;
  ctx.fill("evenodd");
  ctx.restore();

  ctx.lineWidth = SCREEN.zoneWidth;
  ctx.strokeStyle = colors.zoneCurrent;
  ctx.beginPath();
  ctx.arc(cur.x, cur.y, curR, 0, Math.PI * 2);
  ctx.stroke();

  if (zone.wr > 0) {
    const next = worldToScreen(cam, vw, vh, zone.wx, zone.wy);
    ctx.strokeStyle = colors.zoneNext;
    ctx.beginPath();
    ctx.arc(next.x, next.y, Math.max(0, zone.wr * s), 0, Math.PI * 2);
    ctx.stroke();
  }
};

const drawFlashes = (ctx, { cam, vw, vh, flashes, nowMs, colors }) => {
  if (!flashes || flashes.length === 0) return;
  ctx.lineWidth = SCREEN.tracerWidth;
  ctx.strokeStyle = colors.tracer;
  for (const f of flashes) {
    if (f.kx === null || f.kx === undefined) continue;
    const age = (nowMs - f.bornMs) / SCREEN.flashLifetimeMs;
    if (age < 0 || age > 1) continue;
    const a = worldToScreen(cam, vw, vh, f.kx, f.ky);
    const b = worldToScreen(cam, vw, vh, f.vx, f.vy);
    ctx.globalAlpha = 1 - age;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const radiusFor = (meta, selected) => {
  if (selected) return SCREEN.selectedRadius;
  return meta.isFocal ? SCREEN.focalRadius : SCREEN.dotRadius;
};

export const drawScene = (ctx, frame) => {
  if (!ctx) return;
  const { cam, vw, vh, tracks, zone, flashes, nowMs, focusedAccountId, hoveredIndex, colors, atlas, labelCap = 24 } = frame;

  ctx.clearRect(0, 0, vw, vh);
  drawZone(ctx, { cam, vw, vh, zone, colors });
  drawFlashes(ctx, { cam, vw, vh, flashes, nowMs, colors });

  const labels = [];
  for (let i = 0; i < tracks.count; i += 1) {
    const state = tracks.outState[i];
    if (state === STATE.ABSENT) continue;
    const meta = tracks.meta[i];
    const p = worldToScreen(cam, vw, vh, tracks.outX[i], tracks.outY[i]);
    if (p.x < -20 || p.y < -20 || p.x > vw + 20 || p.y > vh + 20) continue;

    const selected = !!focusedAccountId && meta.accountId === focusedAccountId;
    const r = radiusFor(meta, selected);
    const fill = state === STATE.DEAD ? colors.dead : meta.isFocal ? colors.focal : colors.enemy;

    if (atlas && atlas.blit) {
      atlas.blit(ctx, state === STATE.DEAD ? "dead" : meta.isFocal ? "focal" : "enemy", Math.round(p.x), Math.round(p.y), r);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }

    if (selected || i === hoveredIndex) {
      ctx.lineWidth = SCREEN.ringWidth;
      ctx.strokeStyle = colors.ring;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (meta.isFocal || selected || i === hoveredIndex) labels.push({ name: meta.name, x: p.x, y: p.y });
  }

  ctx.font = SCREEN.labelFont;
  ctx.fillStyle = colors.label;
  for (let i = 0; i < Math.min(labels.length, labelCap); i += 1) {
    const l = labels[i];
    ctx.fillText(l.name, l.x + SCREEN.labelOffset, l.y - SCREEN.labelOffset);
  }
};

export const pickIndex = (tracks, cam, vw, vh, sx, sy, radius = 12) => {
  let best = -1;
  let bestD = radius * radius;
  for (let i = 0; i < tracks.count; i += 1) {
    if (tracks.outState[i] === STATE.ABSENT) continue;
    const p = worldToScreen(cam, vw, vh, tracks.outX[i], tracks.outY[i]);
    const dx = p.x - sx;
    const dy = p.y - sy;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};
