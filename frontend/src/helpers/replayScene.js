import { worldToScreen, scaleOf } from "./replayCamera";
import { STATE } from "./replayTracks";
import { healthArc } from "./replayLayers";

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
  // P2 layers. Every one of these is CSS pixels and must never be multiplied
  // by the camera scale -- only zone radii, the map blit and the flight line's
  // endpoints are world-sized.
  flightWidth: 1.5,
  flightDash: [10, 8],
  shotWidth: 1,
  crateRadius: 4,
  chevronRadius: 4,
  healthArcRadius: 4,
  healthArcWidth: 2,
  zoneFillAlpha: 0.18,
  zoneStrokeAlpha: 0.7,
};

// One fill per hazard. An unknown type falls back to the neutral crate colour
// rather than vanishing -- PUBG ships new zone types without warning.
const ZONE_FILL = {
  RedZone: "zoneRed",
  SandStorm: "zoneStorm",
  EMP: "zoneEmp",
};

const offScreen = (p, vw, vh, pad = 20) =>
  p.x < -pad || p.y < -pad || p.x > vw + pad || p.y > vh + pad;

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


// --------------------------------------------------------------- P2 layers

export const paintFlight = (ctx, { cam, vw, vh, segment, alpha, colors }) => {
  if (!ctx || !segment || !(alpha > 0)) return;
  const a = worldToScreen(cam, vw, vh, segment.x1, segment.y1);
  const b = worldToScreen(cam, vw, vh, segment.x2, segment.y2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colors.flight;
  ctx.lineWidth = SCREEN.flightWidth;
  if (ctx.setLineDash) ctx.setLineDash(SCREEN.flightDash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (ctx.setLineDash) ctx.setLineDash([]);
  ctx.restore();
};

export const paintSpecialZones = (ctx, { cam, vw, vh, zones, colors }) => {
  if (!ctx || !zones || zones.length === 0) return;
  const s = scaleOf(cam, vw, vh);
  for (const z of zones) {
    const p = worldToScreen(cam, vw, vh, z.x, z.y);
    const r = Math.max(0, z.r * s);
    // Cull on the circle's bounding box, not its centre: a zone whose centre is
    // off-screen can still cover most of the view at low zoom.
    if (p.x + r < 0 || p.y + r < 0 || p.x - r > vw || p.y - r > vh) continue;
    const colour = colors[ZONE_FILL[z.type]] || colors.crate;
    ctx.save();
    ctx.globalAlpha = SCREEN.zoneFillAlpha;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = SCREEN.zoneStrokeAlpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = SCREEN.zoneWidth;
    ctx.stroke();
    ctx.restore();
  }
};

export const paintShots = (ctx, { cam, vw, vh, shots, colors }) => {
  if (!ctx || !shots || shots.length === 0) return;
  ctx.strokeStyle = colors.tracer;
  ctx.lineWidth = SCREEN.shotWidth;
  for (const shot of shots) {
    const a = worldToScreen(cam, vw, vh, shot.ax, shot.ay);
    const b = worldToScreen(cam, vw, vh, shot.vx, shot.vy);
    // Cull before drawing: a line with both ends off-screen cannot cross the
    // viewport, because the viewport is convex.
    if (offScreen(a, vw, vh) && offScreen(b, vw, vh)) continue;
    ctx.globalAlpha = 1 - shot.age;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

export const paintPackages = (ctx, { cam, vw, vh, packages, colors, atlas }) => {
  if (!ctx || !packages || packages.length === 0) return;
  for (const pkg of packages) {
    const p = worldToScreen(cam, vw, vh, pkg.x, pkg.y);
    if (offScreen(p, vw, vh)) continue;
    const colour = pkg.kind === "redbox" ? colors.danger || colors.crate : colors.crate;
    if (atlas && atlas.blit) {
      atlas.blit(ctx, "crate", Math.round(p.x), Math.round(p.y), SCREEN.crateRadius);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, SCREEN.crateRadius, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    }
    // A falling crate gets a parachute tick so the drop reads as it happens.
    if (pkg.falling) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = SCREEN.shotWidth;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - SCREEN.crateRadius);
      ctx.lineTo(p.x, p.y - SCREEN.crateRadius * 3);
      ctx.stroke();
    }
  }
};

export const paintLandings = (ctx, { cam, vw, vh, landings, alpha, colors, atlas, focalIds }) => {
  if (!ctx || !landings || landings.length === 0 || !(alpha > 0)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const landing of landings) {
    const p = worldToScreen(cam, vw, vh, landing.x, landing.y);
    if (offScreen(p, vw, vh)) continue;
    const isFocal = !!(focalIds && focalIds.has(landing.a));
    const colour = isFocal ? colors.focal : colors.flight;
    if (atlas && atlas.blit) {
      atlas.blit(ctx, "chevron", Math.round(p.x), Math.round(p.y), SCREEN.chevronRadius);
    } else {
      ctx.strokeStyle = colour;
      ctx.lineWidth = SCREEN.shotWidth;
      ctx.beginPath();
      ctx.moveTo(p.x - SCREEN.chevronRadius, p.y + SCREEN.chevronRadius);
      ctx.lineTo(p.x, p.y - SCREEN.chevronRadius);
      ctx.lineTo(p.x + SCREEN.chevronRadius, p.y + SCREEN.chevronRadius);
      ctx.stroke();
    }
  }
  ctx.restore();
};

const paintHealthArc = (ctx, x, y, r, health, colors) => {
  const { fraction, level } = healthArc(health);
  if (fraction >= 1) return;
  ctx.strokeStyle = level === "ok" ? colors.focal : level === "warn" ? colors.warn : colors.tracer;
  ctx.lineWidth = SCREEN.healthArcWidth;
  ctx.beginPath();
  // From 12 o'clock clockwise, so a shrinking arc reads as a draining gauge.
  ctx.arc(x, y, r + SCREEN.healthArcRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
  ctx.stroke();
};

const radiusFor = (meta, selected) => {
  if (selected) return SCREEN.selectedRadius;
  return meta.isFocal ? SCREEN.focalRadius : SCREEN.dotRadius;
};

export const drawScene = (ctx, frame) => {
  if (!ctx) return;
  const {
    cam, vw, vh, tracks, zone, flashes, nowMs, focusedAccountId, hoveredIndex,
    colors, atlas, labelCap = 24,
    shots, specialZones, packages, landings, flightSeg,
    flightAlpha: fAlpha = 1, landingsAlpha: lAlpha = 1, focalIds,
    layers = {},
  } = frame;
  // A missing flag means "on": a caller that knows nothing about layers gets
  // everything, and only an explicit false hides a layer.
  const on = (key) => layers[key] !== false;

  ctx.clearRect(0, 0, vw, vh);
  drawZone(ctx, { cam, vw, vh, zone, colors });
  if (on("specialZones")) paintSpecialZones(ctx, { cam, vw, vh, zones: specialZones, colors });
  if (on("flight")) paintFlight(ctx, { cam, vw, vh, segment: flightSeg, alpha: fAlpha, colors });
  if (on("landings")) paintLandings(ctx, { cam, vw, vh, landings, alpha: lAlpha, colors, atlas, focalIds });
  if (on("packages")) paintPackages(ctx, { cam, vw, vh, packages, colors, atlas });
  if (on("shots")) paintShots(ctx, { cam, vw, vh, shots, colors });
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

    // Only the focal team, the selection and the hover get an arc: sixty rings
    // at once is noise, not information.
    if (on("healthArcs") && state === STATE.ALIVE && (meta.isFocal || selected || i === hoveredIndex)) {
      paintHealthArc(ctx, p.x, p.y, r, tracks.outH ? tracks.outH[i] : 100, colors);
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
