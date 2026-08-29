import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getMapMeta, highResUrl, HIGH_RES_SIZES } from "../../helpers/mapMeta";
import { buildTracks, sampleTracks } from "../../helpers/replayTracks";
import { createSweep, pruneFlashes } from "../../helpers/replayEvents";
import { drawBackground, drawScene, pickIndex, SCREEN } from "../../helpers/replayScene";
import {
  createShotWindow, flightSegment, flightAlpha, landingsAlpha,
  specialZonesAt, packagesAt,
} from "../../helpers/replayLayers";
import { clampCamera, fitCamera, followCamera, scaleOf, zoomAt } from "../../helpers/replayCamera";
import { buildAtlas } from "./replaySprites";
import { zoneAt } from "./replayEngine";

// Two raster tiers behind the same idea: fetch the next one up once the map is
// being sampled past ~70% of the current one's native resolution. The source
// art is 8192px, so 4096 is a real step rather than an upscale -- it is what
// makes the far end of the zoom range worth having.
const RASTER_TIERS = HIGH_RES_SIZES;
const HIGH_RES_TRIGGER = 0.7;
const FLASH_CAP = 40;
// One doubling per double-click: enough to feel like a step, small enough
// that two of them do not overshoot the whole map.
const DOUBLE_CLICK_ZOOM = 2;

// Fetch the 2048 raster once the map is being sampled above ~70% of its native
// resolution. A fixed zoom constant cannot work: the break-even depends on the
// stage size AND on devicePixelRatio, so on a retina display it arrives at a
// much lower zoom than on a 1x one.
// Which tier this view wants: the smallest whose native resolution still
// covers the sampling, or the largest we have.
const wantedTier = (v) => {
  const sampling = Math.min(v.vw, v.vh) * v.dpr * v.cam.zoom;
  for (let i = 0; i < RASTER_TIERS.length; i += 1) {
    if (sampling <= RASTER_TIERS[i] * HIGH_RES_TRIGGER) return i;
  }
  return RASTER_TIERS.length;
};

// Last-resort paint: only reached when no stylesheet resolved the token in
// TOKEN_FOR below. Deliberately approximate rather than a copy of the token
// value -- a copy is a second home for the same colour, and because this half
// only ever shows with the stylesheet gone, a retuned token would drift away
// from it in silence. Near enough to stay legible, far enough that nobody
// reads it as the source of truth. focal/enemy/dead must stay told apart even
// here, and band is the letterbox behind the map, so it must stay dark.
const FALLBACK_COLORS = {
  focal: "rgb(110,230,150)",
  enemy: "rgb(225,228,245)",
  dead: "rgb(108,112,144)",
  tracer: "rgb(255,140,140)",
  zoneCurrent: "rgb(255,255,255)",
  zoneNext: "rgb(90,180,255)",
  outside: "rgba(40,90,200,0.28)",
  ring: "rgb(250,220,60)",
  label: "rgb(255,255,255)",
  band: "rgb(16,25,40)",
  warn: "rgb(255,143,60)",
  zoneRed: "rgb(255,59,48)",
  zoneStorm: "rgb(200,162,90)",
  zoneEmp: "rgb(143,107,255)",
  crate: "rgb(255,62,200)",
  flight: "rgb(79,216,255)",
  shot: "rgb(255,205,80)",
  // The halo every marker is cut out with. Near-black so it reads against
  // snow and sand alike, and never mistakable for a team colour.
  outline: "rgb(20,18,30)",
};

// These three resolve to a token another entry already uses, so they share its
// fallback rather than repeating the literal -- which would duplicate a value
// and trip the colour ratchet for no gain.
FALLBACK_COLORS.danger = FALLBACK_COLORS.tracer;
FALLBACK_COLORS.healthOk = FALLBACK_COLORS.focal;
FALLBACK_COLORS.healthLow = FALLBACK_COLORS.zoneRed;

const TOKEN_FOR = {
  focal: "--ok",
  enemy: "--text",
  dead: "--rest",
  tracer: "--danger",
  ring: "--brand",
  label: "--text-strong",
  band: "--surface",
  warn: "--warn",
  zoneRed: "--zone-red",
  zoneStorm: "--zone-storm",
  zoneEmp: "--zone-emp",
  crate: "--crate",
  flight: "--flight",
  shot: "--warn",
  danger: "--danger",
  healthOk: "--ok",
  healthLow: "--zone-red",
};

const resolveColors = (el) => {
  const out = { ...FALLBACK_COLORS };
  if (!el || typeof window === "undefined" || !window.getComputedStyle) return out;
  const cs = window.getComputedStyle(el);
  for (const [key, token] of Object.entries(TOKEN_FOR)) {
    const v = cs.getPropertyValue(token).trim();
    if (v) out[key] = v;
  }
  return out;
};

const normaliseWheel = (e) => {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dy = Math.max(-120, Math.min(120, e.deltaY * unit));
  return Math.exp(-dy * (e.ctrlKey ? 0.02 : 0.0025));
};

const ReplayStage = forwardRef(({ data, clockRef, focusedAccountId, onSelect, mapLabel, publish, layers, follow, fullscreenLabel = "Fullscreen", exitFullscreenLabel, children }, ref) => {
  const wrapRef = useRef(null);
  const bgRef = useRef(null);
  const fxRef = useRef(null);

  const meta = useMemo(() => getMapMeta(data.rawMapName), [data.rawMapName]);
  const tracks = useMemo(() => buildTracks(data.players), [data.players]);
  const sweep = useMemo(() => createSweep(data.kills || []), [data.kills]);
  const shotWindow = useMemo(() => createShotWindow(data.shots), [data.shots]);
  // The flight corridor and the focal id set are per-match constants: computing
  // them once keeps the frame loop free of allocation.
  const flightSeg = useMemo(
    () => flightSegment(data.flight, data.mapMax),
    [data.flight, data.mapMax],
  );
  const focalIds = useMemo(
    () => new Set((data.players || []).filter((p) => p.isFocal).map((p) => p.accountId)),
    [data.players],
  );

  const view = useRef({
    cam: fitCamera(data.mapMax),
    vw: 0,
    vh: 0,
    dpr: 1,
    bgDirty: true,
    image: null,
    tier: 0,
    atlas: null,
    colors: { ...FALLBACK_COLORS },
    flashes: [],
    hoveredIndex: -1,
    pointers: new Map(),
    gesture: null,
    mapGen: 0,
    // Reused every frame by the layer selectors; never reallocated.
    follow: false,
    crateArt: null,
    shotBuf: [],
    zoneBuf: [],
    pkgBuf: [],
    layers: {},
  });

  const focusedRef = useRef(focusedAccountId);
  useEffect(() => { focusedRef.current = focusedAccountId; }, [focusedAccountId]);

  // Follow is armed by the caller and disarmed by the viewer: any pan or zoom
  // means they want to look somewhere else, and a camera that snapped back
  // would be unusable. Selecting someone re-arms it.
  useEffect(() => { view.current.follow = !!follow && !!focusedAccountId; }, [follow, focusedAccountId]);

  // Layer flags are read by the draw loop every frame, so they live in the view
  // ref rather than in state: toggling one must not re-render the tree while
  // the animation is running.
  useEffect(() => { view.current.layers = layers || {}; }, [layers]);

  useEffect(() => {
    const v = view.current;
    v.mapGen += 1;
    v.cam = fitCamera(data.mapMax);
    v.bgDirty = true;
    v.flashes.length = 0;
    v.tier = 0;
    v.image = null;
    // Also invalidates an in-flight high-res load on unmount, so a late
    // onload with no map change finds a stale generation and drops itself.
    return () => { v.mapGen += 1; };
  }, [data.mapMax, data.rawMapName]);

  // PUBG's own care-package artwork. Three small PNGs, loaded once and shared by
  // every crate on the map; until they arrive the drawn glyph stands in.
  useEffect(() => {
    if (typeof Image === "undefined") return undefined;
    let cancelled = false;
    const v = view.current;
    for (const [key, file] of [["falling", "CarePackage_Flying"], ["landed", "CarePackage_Normal"], ["open", "CarePackage_Open"]]) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        v.crateArt = { ...(v.crateArt || {}), [key]: img };
        v.bgDirty = true;
      };
      img.src = `/map-icons/${file}.png`;
    }
    return () => { cancelled = true; };
  }, []);

  // Base raster first, so there is never a blank frame.
  useEffect(() => {
    if (!meta.image || typeof Image === "undefined") return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      view.current.image = img;
      view.current.bgDirty = true;
    };
    img.src = meta.image;
    return () => { cancelled = true; };
  }, [meta.image]);

  // Climb one tier at a time, and never back down: a coarser raster arriving
  // late must not replace a sharper one already on screen.
  const requestTier = useCallback(() => {
    const v = view.current;
    if (typeof Image === "undefined") return;
    const want = wantedTier(v);
    if (want <= v.tier) return;
    const size = RASTER_TIERS[Math.min(want, RASTER_TIERS.length) - 1];
    const url = highResUrl(data.rawMapName, size);
    if (!url) return;
    const climbing = v.tier + 1;
    v.tier = climbing;
    const gen = v.mapGen;
    const img = new Image();
    img.onload = () => {
      if (v.mapGen !== gen) return;
      v.image = img;
      v.bgDirty = true;
    };
    img.onerror = () => {
      // The tier is not there; drop back so a later zoom can retry the one
      // below rather than the map being stuck on the base raster forever.
      if (v.mapGen === gen && v.tier === climbing) v.tier = climbing - 1;
    };
    img.src = url;
  }, [data.rawMapName]);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const bg = bgRef.current;
    const fx = fxRef.current;
    if (!wrap || !bg || !fx) return;
    const rect = wrap.getBoundingClientRect();
    const vw = Math.max(1, Math.round(rect.width));
    const vh = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    const v = view.current;
    if (v.vw === vw && v.vh === vh && v.dpr === dpr) return;
    v.vw = vw; v.vh = vh; v.dpr = dpr;
    for (const canvas of [bg, fx]) {
      const w = Math.round(vw * dpr);
      const h = Math.round(vh * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    v.colors = resolveColors(fx);
    v.atlas = buildAtlas({ dpr, colors: v.colors });
    v.cam = clampCamera(v.cam, vw, vh);
    v.bgDirty = true;
    // A retina display can already be past the trigger at zoom 1.
    requestTier();
  }, [requestTier]);

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !wrapRef.current) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // --accent et al. live on .app.<theme>, so a theme swap (which only ever
  // toggles that class) needs its own watcher to avoid stale canvas colours.
  useEffect(() => {
    const fx = fxRef.current;
    if (!fx || typeof MutationObserver === "undefined") return undefined;
    const app = fx.closest(".app");
    if (!app) return undefined;
    const v = view.current;
    const onThemeChange = () => {
      v.colors = resolveColors(fx);
      v.atlas = buildAtlas({ dpr: v.dpr, colors: v.colors });
      v.bgDirty = true;
    };
    const mo = new MutationObserver(onThemeChange);
    mo.observe(app, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Reset the sweep cursor whenever the clock jumps -- and once on mount, since
  // the clock outlives this component (tab switch, "Reset view") and a fresh
  // sweep would otherwise replay every kill since t=0 as one burst of tracers.
  useEffect(() => {
    const core = clockRef.current;
    if (!core) return undefined;
    const onSeek = (t) => {
      sweep.reset(t);
      view.current.flashes.length = 0;
      view.current.bgDirty = true;
    };
    onSeek(core.t);
    core.onSeek(onSeek);
    return () => core.offSeek(onSeek);
  }, [clockRef, sweep]);

  // Wheel needs { passive: false } to preventDefault, so it is registered by hand.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const v = view.current;
      if (!v.vw) return;
      const rect = el.getBoundingClientRect();
      v.follow = false;
      v.cam = zoomAt(v.cam, v.vw, v.vh, v.cam.zoom * normaliseWheel(e), e.clientX - rect.left, e.clientY - rect.top);
      requestTier();
      v.bgDirty = true;
    };
    const blockGesture = (e) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", blockGesture, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", blockGesture);
    };
  }, [requestTier]);

  useEffect(() => {
    let raf = null;
    const frame = (nowMs) => {
      const v = view.current;
      const core = clockRef.current;
      const fx = fxRef.current;
      const bg = bgRef.current;
      if (core && v.vw) {
        const { t } = core.advance(nowMs);
        if (publish && core.shouldPublish(nowMs)) publish();
        for (const kill of sweep.sweepTo(t)) {
          v.flashes.push({ bornMs: nowMs, kx: kill.kx, ky: kill.ky, vx: kill.vx, vy: kill.vy });
        }
        pruneFlashes(v.flashes, nowMs, SCREEN.flashLifetimeMs, FLASH_CAP);
        sampleTracks(tracks, t);

        if (v.follow && focusedRef.current) {
          const i = tracks.meta.findIndex((m) => m.accountId === focusedRef.current);
          if (i >= 0 && tracks.outState[i] !== 0) {
            const next = followCamera(v.cam, tracks.outX[i], tracks.outY[i], v.vw, v.vh);
            // followCamera returns the same object when nothing moved, so this
            // only marks the background dirty on a real change.
            if (next !== v.cam) { v.cam = next; v.bgDirty = true; }
          }
        }

        const bgCtx = bg && bg.getContext("2d");
        if (bgCtx && v.bgDirty) {
          drawBackground(bgCtx, { cam: v.cam, vw: v.vw, vh: v.vh, image: v.image, bandColor: v.colors.band });
          v.bgDirty = false;
        }
        const fxCtx = fx && fx.getContext("2d");
        if (fxCtx) {
          drawScene(fxCtx, {
            cam: v.cam, vw: v.vw, vh: v.vh, tracks,
            zone: zoneAt(data.zones, t),
            flashes: v.flashes, nowMs,
            focusedAccountId: focusedRef.current,
            hoveredIndex: v.hoveredIndex,
            colors: v.colors, atlas: v.atlas,
            focalTeamId: data.focalTeamId ?? null,
            crateArt: v.crateArt,
            shots: shotWindow.activeAt(t, v.shotBuf),
            specialZones: specialZonesAt(data.specialZones, t, v.zoneBuf),
            packages: packagesAt(data.packages, t, v.pkgBuf),
            landings: data.landings,
            landingsT: t,
            knocks: data.knocks,
            revives: data.revives,
            t,
            flightSeg,
            flight: data.flight,
            flightAlpha: flightAlpha(t),
            landingsAlpha: landingsAlpha(t),
            focalIds,
            layers: v.layers,
          });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { if (raf !== null) cancelAnimationFrame(raf); };
  }, [clockRef, data.zones, data.specialZones, data.packages, data.landings,
      data.knocks, data.revives, data.flight, data.focalTeamId,
      sweep, tracks, publish, shotWindow, flightSeg, focalIds]);

  const localPoint = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    const v = view.current;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    v.pointers.set(e.pointerId, localPoint(e));
    const pts = [...v.pointers.values()];
    if (pts.length >= 2) {
      v.gesture = {
        mode: "pinch",
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        baseZoom: v.cam.zoom,
      };
    } else {
      const p = pts[0];
      v.gesture = { mode: "pan", startX: p.x, startY: p.y, baseCx: v.cam.cx, baseCy: v.cam.cy, moved: false };
    }
  };

  const onPointerMove = (e) => {
    const v = view.current;
    const p = localPoint(e);
    if (!v.pointers.has(e.pointerId)) {
      const hit = pickIndex(tracks, v.cam, v.vw, v.vh, p.x, p.y);
      v.hoveredIndex = hit;
      return;
    }
    v.pointers.set(e.pointerId, p);
    const g = v.gesture;
    if (!g || !v.vw) return;
    const pts = [...v.pointers.values()];
    if (g.mode === "pinch" && pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (g.startDist > 0) {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        v.cam = zoomAt(v.cam, v.vw, v.vh, g.baseZoom * (dist / g.startDist), mid.x, mid.y);
        requestTier();
        v.bgDirty = true;
      }
    } else if (g.mode === "pan") {
      const s = scaleOf(v.cam, v.vw, v.vh);
      // Dragging means the viewer wants to look elsewhere; a camera that
      // snapped back to the followed player would be unusable.
      if (g.moved) v.follow = false;
      if (s > 0) {
        g.moved = g.moved || Math.hypot(p.x - g.startX, p.y - g.startY) > 4;
        v.cam = clampCamera(
          { ...v.cam, cx: g.baseCx - (p.x - g.startX) / s, cy: g.baseCy - (p.y - g.startY) / s },
          v.vw, v.vh
        );
        v.bgDirty = true;
      }
    }
  };

  const endPointer = (e) => {
    const v = view.current;
    const g = v.gesture;
    const had = v.pointers.has(e.pointerId);
    v.pointers.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (had && g && g.mode === "pan" && !g.moved && v.vw) {
      const p = localPoint(e);
      const hit = pickIndex(tracks, v.cam, v.vw, v.vh, p.x, p.y);
      const id = hit >= 0 ? tracks.meta[hit].accountId : null;
      onSelect(id && id === focusedRef.current ? null : id);
    }
    if (v.pointers.size === 0) v.gesture = null;
    // A pinch with one finger left is not a pinch. Without this the gesture
    // stays stuck and the remaining finger neither pans nor zooms.
    else if (g && g.mode === "pinch" && v.pointers.size < 2) v.gesture = null;
  };

  const onPointerLeave = () => {
    view.current.hoveredIndex = -1;
  };

  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen =
    typeof document !== "undefined" && typeof Element !== "undefined" &&
    typeof Element.prototype.requestFullscreen === "function";

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !canFullscreen) return;
    // Both reject when the browser refuses (no transient activation, framed
    // without allow="fullscreen"); swallow rather than leak a rejection.
    const done = document.fullscreenElement === el ? document.exitFullscreen?.() : el.requestFullscreen?.();
    if (done && typeof done.catch === "function") done.catch(() => {});
  }, [canFullscreen]);

  // The button's label has to follow the real state, not our last click:
  // Escape leaves fullscreen without going through us.
  useEffect(() => {
    if (!canFullscreen) return undefined;
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [canFullscreen]);

  const resetView = useCallback(() => {
    const v = view.current;
    v.cam = clampCamera(fitCamera(v.cam.mapMax), v.vw, v.vh);
    v.bgDirty = true;
  }, []);

  // The page's Reset view button drives the same code path as the R shortcut,
  // rather than remounting the stage and discarding its loaded rasters.
  useImperativeHandle(ref, () => ({ resetView, toggleFullscreen }), [resetView, toggleFullscreen]);

  // Double-click zooms IN, toward the cursor, the way every other map does.
  // It used to reset the view, which meant selecting two players in quick
  // succession threw away the zoom the viewer had just set up -- and read as
  // the camera resetting on its own, because nothing they did looked like a
  // reset. Reset lives on its button and on R.
  const onDoubleClick = (e) => {
    const el = wrapRef.current;
    const v = view.current;
    if (!el || !v.vw) return;
    const rect = el.getBoundingClientRect();
    v.follow = false;
    v.cam = zoomAt(v.cam, v.vw, v.vh, v.cam.zoom * DOUBLE_CLICK_ZOOM, e.clientX - rect.left, e.clientY - rect.top);
    v.bgDirty = true;
  };

  // The button does two jobs, so it needs two names -- a screen reader told
  // "Fullscreen" while already in fullscreen is being told the opposite of
  // what the button does.
  const label = fullscreen ? (exitFullscreenLabel || fullscreenLabel) : fullscreenLabel;

  return (
    <div
      ref={wrapRef}
      className="replay-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onLostPointerCapture={endPointer}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={bgRef} className="replay-stage__layer replay-stage__layer--bg" aria-hidden="true" />
      <canvas ref={fxRef} className="replay-stage__layer replay-stage__layer--fx" role="img" aria-label={mapLabel} />
      {children}
      {canFullscreen ? (
        <button
          type="button"
          className="replay-stage__fullscreen"
          onClick={toggleFullscreen}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={label}
          title={label}
        >
          {fullscreen ? "✕" : "⛶"}
        </button>
      ) : null}
    </div>
  );
});

ReplayStage.displayName = "ReplayStage";

export default ReplayStage;
