import { worldToScreen, scaleOf } from "./replayCamera";
import { STATE } from "./replayTracks";
import { healthArc, planeAt } from "./replayLayers";
import { vehicleGlyph, teamColorIndex } from "../component/charts/replaySprites";

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
  // A care package is a landmark: people move towards it and it stays put for
  // the rest of the match, unlike a player who is only passing through. At a
  // player's size it read as just another dot, so it is drawn about half again
  // as wide as the biggest player marker, and the artwork carries its own
  // margin on top of that.
  crateArtScale: 2.6,
  // How far above its landing point a crate is drawn at the moment it leaves
  // the plane. The descent takes 52 in-game seconds at the median, so this is
  // travelled slowly enough to read as a drop rather than as a jump.
  crateFallHeight: 54,
  // Amplitude of the swing at the top, damped to nothing by touchdown so the
  // crate settles onto its point instead of snapping to it.
  crateSway: 4,
  crateSwayTurns: 2.5,
  // A crate somebody has already emptied is still worth seeing -- it says where
  // a fight probably happened -- but it is no longer worth walking to, so it
  // recedes. Rasterised at marker size over the four grounds the map actually
  // shows (Erangel green, Miramar sand, Vikendi snow, out-of-zone), 0.6 is
  // where it reads as faded without going pale on snow: by 0.45 it is getting
  // weak there, and at 0.75 the difference barely registers.
  lootedAlpha: 0.6,
  chevronRadius: 4,
  // Bigger than a player: it carries sixty of them.
  planeRadius: 9,
  // A canopy is four shrouds fanning out, and they need room to be four rather
  // than one blob -- the halo is as wide as the lines themselves. Larger than a
  // player, and the state is brief and only at the start of a match.
  parachuteRadius: 9,
  healthArcRadius: 4,
  healthArcWidth: 2,
  zoneFillAlpha: 0.18,
  zoneStrokeAlpha: 0.7,
  knockRadius: 6,
  reviveRadius: 6,
  markerLifetime: 8,
  // A corpse marks where someone died, which stops being news. By the endgame
  // ~90 of 100 players are dead, and drawing every cross forever buries the
  // handful still playing.
  deadFadeStart: 60,
  deadFadeEnd: 240,
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

// Cohen-Sutherland outcode. "Both endpoints are outside" does NOT mean the
// segment misses -- a tracer can enter one edge and leave another. Only a
// shared outcode bit proves both ends sit beyond the SAME edge, which is the
// one case a segment can be rejected outright.
const outcode = (p, vw, vh, pad = 20) =>
  (p.x < -pad ? 1 : 0) | (p.x > vw + pad ? 2 : 0) |
  (p.y < -pad ? 4 : 0) | (p.y > vh + pad ? 8 : 0);

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

// The cargo plane itself, on the corridor, while it is over the map. Drawn
// with the aircraft glyph the player markers already use, so a viewer who has
// learnt one has learnt the other.
export const paintPlane = (ctx, { cam, vw, vh, flight, t, colors, atlas }) => {
  if (!ctx || !flight) return;
  const at = planeAt(flight, t, cam.mapMax);
  if (!at) return;
  const p = worldToScreen(cam, vw, vh, at.x, at.y);
  if (atlas && atlas.blit) {
    atlas.blit(ctx, "planeEnemy", Math.round(p.x), Math.round(p.y), SCREEN.planeRadius, at.angle);
    return;
  }
  // Fallback: a triangle pointing along the corridor.
  const r = SCREEN.planeRadius;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(at.angle);
  ctx.fillStyle = colors.flight;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r, -r * 0.7);
  ctx.lineTo(-r, r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

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
  // Deliberately NOT colors.tracer: kill flashes own that hue, and a shot
  // painted the same made an exchange of fire look like someone dying.
  ctx.strokeStyle = colors.shot || colors.warn;
  ctx.lineWidth = SCREEN.shotWidth;
  for (const shot of shots) {
    const a = worldToScreen(cam, vw, vh, shot.ax, shot.ay);
    const b = worldToScreen(cam, vw, vh, shot.vx, shot.vy);
    if (outcode(a, vw, vh) & outcode(b, vw, vh)) continue;
    ctx.globalAlpha = 1 - shot.age;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

// A knock is not a kill: hollow ring at the victim, plus the attacker tracer.
// A revive is the same event running backwards, so it reads as a ring too, in
// the health colour. Both expire -- they are moments, not places.
export const paintMarkers = (ctx, { cam, vw, vh, knocks, revives, t, colors }) => {
  if (!ctx) return;
  const age = (at) => (t - at) / SCREEN.markerLifetime;
  ctx.save();
  ctx.lineWidth = SCREEN.tracerWidth;
  for (const k of knocks || []) {
    const a = age(k.t);
    if (a < 0 || a > 1) continue;
    const p = worldToScreen(cam, vw, vh, k.vx, k.vy);
    if (offScreen(p, vw, vh)) continue;
    ctx.globalAlpha = 1 - a;
    ctx.strokeStyle = colors.warn;
    ctx.beginPath();
    ctx.arc(p.x, p.y, SCREEN.knockRadius, 0, Math.PI * 2);
    ctx.stroke();
    if (k.ax !== null && k.ax !== undefined) {
      const from = worldToScreen(cam, vw, vh, k.ax, k.ay);
      if (!(outcode(from, vw, vh) & outcode(p, vw, vh))) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  }
  for (const r of revives || []) {
    const a = age(r.t);
    if (a < 0 || a > 1) continue;
    const p = worldToScreen(cam, vw, vh, r.x, r.y);
    if (offScreen(p, vw, vh)) continue;
    ctx.globalAlpha = 1 - a;
    ctx.strokeStyle = colors.healthOk;
    ctx.beginPath();
    ctx.arc(p.x, p.y, SCREEN.reviveRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

export const paintPackages = (ctx, { cam, vw, vh, packages, colors, atlas, images }) => {
  if (!ctx || !packages || packages.length === 0) return;
  for (let i = 0; i < packages.length; i += 1) {
    const pkg = packages[i];
    const p = worldToScreen(cam, vw, vh, pkg.x, pkg.y);
    // A falling crate is drawn above its landing point, so one whose point sits
    // just past the bottom edge is still on screen.
    if (offScreen(p, vw, vh, SCREEN.crateFallHeight + 20)) continue;

    // Seen from above a crate drops straight down, so the descent is faked in
    // screen space: it starts high over the point it is going to land on and
    // comes down onto it, swinging under the canopy on the way. The phase is
    // seeded off the index rather than the position so a cluster of drops does
    // not swing as one rigid object.
    const fall = typeof pkg.fall === "number" ? pkg.fall : 1;
    const rise = pkg.falling ? (1 - fall) * SCREEN.crateFallHeight : 0;
    const sway = pkg.falling
      ? Math.sin(fall * SCREEN.crateSwayTurns * Math.PI * 2 + i) * SCREEN.crateSway * (1 - fall)
      : 0;
    const cx = p.x + sway;
    const cy = p.y - rise;

    // Faded once somebody has been through it. Still in the air means still
    // worth going to, whatever happens to it later.
    const spent = !!pkg.looted && !pkg.falling;
    if (spent) {
      ctx.save();
      ctx.globalAlpha = SCREEN.lootedAlpha;
    }

    // PUBG's own crate artwork, which is the one thing in their asset repo that
    // is genuinely a map marker rather than a killfeed row or a product render.
    // Three states, and the payload knows all three: under canopy, on the
    // ground, and opened by whoever got there first.
    const art = images && (pkg.falling ? images.falling : (pkg.looted ? images.open : images.landed));
    if (art && art.width && art.height) {
      const w = SCREEN.crateRadius * 2 * SCREEN.crateArtScale;
      const h = w * (art.height / art.width);
      ctx.drawImage(art, cx - w / 2, cy - h / 2, w, h);
    } else {
      // Until it loads, and wherever it cannot be fetched, the drawn glyph
      // stands in -- there is never a frame with no care packages on it.
      const red = pkg.kind === "redbox";
      const colour = red ? colors.danger || colors.crate : colors.crate;
      if (atlas && atlas.blit) {
        atlas.blit(ctx, red ? "crateRed" : "crate", Math.round(cx), Math.round(cy), SCREEN.crateRadius);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, SCREEN.crateRadius, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }
      if (pkg.falling) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = SCREEN.shotWidth;
        ctx.beginPath();
        ctx.moveTo(cx, cy - SCREEN.crateRadius);
        ctx.lineTo(cx, cy - SCREEN.crateRadius * 3);
        ctx.stroke();
      }
    }

    if (spent) ctx.restore();
  }
};

export const paintLandings = (ctx, { cam, vw, vh, landings, alpha, colors, atlas, focalIds, t = Infinity }) => {
  if (!ctx || !landings || landings.length === 0 || !(alpha > 0)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const landing of landings) {
    // A landing marker before the player has landed is a spoiler and a lie.
    if (landing.t > t) continue;
    const p = worldToScreen(cam, vw, vh, landing.x, landing.y);
    if (offScreen(p, vw, vh)) continue;
    const isFocal = !!(focalIds && focalIds.has(landing.a));
    const colour = isFocal ? colors.focal : colors.enemy;
    if (atlas && atlas.blit) {
      // The atlas bakes one colour per cell, so friend/foe has to be the kind.
      atlas.blit(ctx, isFocal ? "chevronFocal" : "chevronEnemy", Math.round(p.x), Math.round(p.y), SCREEN.chevronRadius);
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
  // Health is its own encoding. Borrowing the focal hue would read as
  // "teammate" and the tracer hue as "kill", so it gets dedicated colours.
  ctx.strokeStyle = level === "ok" ? colors.healthOk : level === "warn" ? colors.warn : colors.healthLow;
  ctx.lineWidth = SCREEN.healthArcWidth;
  ctx.beginPath();
  // From 12 o'clock clockwise, so a shrinking arc reads as a draining gauge.
  ctx.arc(x, y, r + SCREEN.healthArcRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
  ctx.stroke();
};


// Friend/foe is baked into the glyph name because the atlas bakes one colour
// per cell: a shared "knocked" kind would blit a downed teammate in the enemy
// colour, inverting the one distinction that matters most at exactly the
// moment that player needs watching. Knocked outranks in-vehicle -- being
// downed is the more urgent read.
const glyphFor = (state, flags, isFocal, moving, falling) => {
  const side = isFocal ? "Focal" : "Enemy";
  if (state === STATE.DEAD) return "dead";
  // Knocked outranks everything: it is the most urgent thing about a player,
  // and a downed passenger is still downed.
  if (flags & 2) return `knocked${side}`;
  // Under canopy outranks movement and vehicle: they are always moving fast on
  // the way down, and the descent is the thing worth showing.
  if (falling) return `parachute${side}`;
  // The glyph names live with the glyphs, so the mapping has one home.
  if (flags & 1) return vehicleGlyph((flags >> 2) & 7, isFocal);
  // A dart says "going that way", so it may only be drawn when there is a way.
  if (moving) return `moving${side}`;
  return isFocal ? "focal" : "enemy";
};

const radiusFor = (meta, selected) => {
  if (selected) return SCREEN.selectedRadius;
  return meta.isFocal ? SCREEN.focalRadius : SCREEN.dotRadius;
};

export const drawScene = (ctx, frame) => {
  if (!ctx) return;
  const {
    cam, vw, vh, tracks, zone, flashes, nowMs, focusedAccountId, hoveredIndex,
    colors, atlas, labelCap = 24, focalTeamId = null,
    shots, specialZones, packages, landings, landingsT, flightSeg, flight, knocks, revives, crateArt,
    t: frameT,
    flightAlpha: fAlpha = 1, landingsAlpha: lAlpha = 1, focalIds,
    layers = {},
  } = frame;
  // A missing flag means "on": a caller that knows nothing about layers gets
  // everything, and only an explicit false hides a layer.
  const on = (key) => layers[key] !== false;

  ctx.clearRect(0, 0, vw, vh);
  drawZone(ctx, { cam, vw, vh, zone, colors });
  if (on("specialZones")) paintSpecialZones(ctx, { cam, vw, vh, zones: specialZones, colors });
  if (on("flight")) {
    paintFlight(ctx, { cam, vw, vh, segment: flightSeg, alpha: fAlpha, colors });
    // Not faded with the corridor: the plane is only on the map while it is
    // actually flying, and that window closes on its own.
    paintPlane(ctx, { cam, vw, vh, flight, t: frameT, colors, atlas });
  }
  if (on("landings")) paintLandings(ctx, { cam, vw, vh, landings, alpha: lAlpha, colors, atlas, focalIds, t: landingsT });
  if (on("packages")) paintPackages(ctx, { cam, vw, vh, packages, colors, atlas, images: crateArt });
  if (on("shots")) paintShots(ctx, { cam, vw, vh, shots, colors });
  paintMarkers(ctx, { cam, vw, vh, knocks, revives, t: frameT, colors });
  drawFlashes(ctx, { cam, vw, vh, flashes, nowMs, colors });

  const labels = [];
  for (let i = 0; i < tracks.count; i += 1) {
    const state = tracks.outState[i];
    if (state === STATE.ABSENT) continue;
    const meta = tracks.meta[i];
    const p = worldToScreen(cam, vw, vh, tracks.outX[i], tracks.outY[i]);
    if (p.x < -20 || p.y < -20 || p.x > vw + 20 || p.y > vh + 20) continue;

    // A corpse fades out; the living never do.
    let markerAlpha = 1;
    if (state === STATE.DEAD && meta.deathTime !== null) {
      const since = frameT - meta.deathTime;
      if (since > SCREEN.deadFadeEnd) continue;
      if (since > SCREEN.deadFadeStart) {
        markerAlpha = 1 - (since - SCREEN.deadFadeStart) / (SCREEN.deadFadeEnd - SCREEN.deadFadeStart);
      }
    }
    ctx.globalAlpha = markerAlpha;

    const selected = !!focusedAccountId && meta.accountId === focusedAccountId;
    const flags = tracks.outF ? tracks.outF[i] : 0;
    const moving = state === STATE.ALIVE && tracks.outMoving && tracks.outMoving[i] === 1;
    const falling = state === STATE.ALIVE && tracks.outFalling && tracks.outFalling[i] === 1;
    // The canopy is drawn larger than the player it replaces: four shrouds need
    // room to read as four rather than as one blob. See SCREEN.parachuteRadius.
    const r = falling ? SCREEN.parachuteRadius : radiusFor(meta, selected);
    const fill = state === STATE.DEAD ? colors.dead : meta.isFocal ? colors.focal : colors.enemy;

    // A vehicle glyph has a nose, so it is aimed even at rest: the cell points
    // +x, and drawing a stopped car upright would face every parked vehicle
    // due east. The sampler holds the last real bearing for exactly this. A
    // still player is a disc with no axis, so it is left unrotated -- and
    // undefined rather than 0, because 0 is a real heading.
    // Everything but the canopy: every other glyph points +x and reads better
    // aimed along the direction of travel, but a parachute has an up. Turning
    // it would hang the canopy sideways, worst of all in the last seconds of a
    // descent when the horizontal component is jitter.
    const aimed = state === STATE.ALIVE && !falling && ((flags & 1) || moving);
    if (atlas && atlas.blit) {
      const angle = aimed && tracks.outAngle ? tracks.outAngle[i] : undefined;
      atlas.blit(
        ctx, glyphFor(state, flags, meta.isFocal, moving, falling),
        Math.round(p.x), Math.round(p.y), r, angle,
        // Colour is the team; form is the state. The focal team resolves to 0,
        // which is its own colour rather than one drawn from the palette.
        teamColorIndex(meta.teamId, focalTeamId),
      );
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
      // r + 4, not r + 3: the marker halo now paints past the glyph box, and
      // at the selected radius the ring was landing half a pixel off it.
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Only the focal team, the selection and the hover get an arc: sixty rings
    // at once is noise, not information.
    if (on("healthArcs") && state === STATE.ALIVE && (meta.isFocal || selected || i === hoveredIndex)) {
      paintHealthArc(ctx, p.x, p.y, r, tracks.outH ? tracks.outH[i] : 100, colors);
    }

    if (meta.isFocal || selected || i === hoveredIndex) labels.push({ name: meta.name, x: p.x, y: p.y });
  }
  ctx.globalAlpha = 1;

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
