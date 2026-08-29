export const MIN_ZOOM = 1;
// 16, not 6: at 6 a typical stage still showed 2.4 km across, too wide to
// follow a fight. Markers are screen-sized, so zoom is what separates players.
// The map raster is what limits this -- see the two high-res tiers in
// ReplayStage -- not the camera maths.
export const MAX_ZOOM = 16;

export const baseScale = (vw, vh, mapMax) => (mapMax > 0 ? Math.min(vw, vh) / mapMax : 0);

export const scaleOf = (cam, vw, vh) => baseScale(vw, vh, cam.mapMax) * cam.zoom;

export const worldToScreen = (cam, vw, vh, wx, wy) => {
  const s = scaleOf(cam, vw, vh);
  return { x: (wx - cam.cx) * s + vw / 2, y: (wy - cam.cy) * s + vh / 2 };
};

export const screenToWorld = (cam, vw, vh, sx, sy) => {
  const s = scaleOf(cam, vw, vh);
  if (s === 0) return { x: cam.cx, y: cam.cy };
  return { x: (sx - vw / 2) / s + cam.cx, y: (sy - vh / 2) / s + cam.cy };
};

const clampAxis = (c, half, mapMax) =>
  mapMax >= half * 2 ? Math.min(Math.max(c, half), mapMax - half) : mapMax / 2;

export const clampCamera = (cam, vw, vh) => {
  const s = scaleOf(cam, vw, vh);
  if (s === 0) return cam;
  return {
    ...cam,
    cx: clampAxis(cam.cx, vw / 2 / s, cam.mapMax),
    cy: clampAxis(cam.cy, vh / 2 / s, cam.mapMax),
  };
};

export const zoomAt = (cam, vw, vh, nextZoom, px, py) => {
  const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const b = baseScale(vw, vh, cam.mapMax);
  if (b === 0) return cam;
  const k = 1 / (b * cam.zoom) - 1 / (b * z1);
  return clampCamera(
    { ...cam, zoom: z1, cx: cam.cx + (px - vw / 2) * k, cy: cam.cy + (py - vh / 2) * k },
    vw,
    vh
  );
};

export const fitCamera = (mapMax) => ({ cx: mapMax / 2, cy: mapMax / 2, zoom: MIN_ZOOM, mapMax });

// Centre the camera on a world point, clamped exactly the way panning is. The
// decision lives here rather than in the component so the edge cases -- a
// followed player walking into a map corner, a target with no position yet --
// are reasoned about in one place and tested without a DOM.
//
// Returns the same object when nothing moved: the frame loop compares identity
// to decide whether the background needs redrawing, and a no-op follow must
// not look like a change.
export const followCamera = (cam, wx, wy, vw, vh) => {
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return cam;
  const next = clampCamera({ ...cam, cx: wx, cy: wy }, vw, vh);
  return next.cx === cam.cx && next.cy === cam.cy ? cam : next;
};
