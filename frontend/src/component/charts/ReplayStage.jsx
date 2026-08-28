import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { getMapMeta, highResUrl } from "../../helpers/mapMeta";
import { buildTracks, sampleTracks } from "../../helpers/replayTracks";
import { createSweep, pruneFlashes } from "../../helpers/replayEvents";
import { drawBackground, drawScene, pickIndex, SCREEN } from "../../helpers/replayScene";
import {
  createShotWindow, flightSegment, flightAlpha, landingsAlpha,
  specialZonesAt, packagesAt,
} from "../../helpers/replayLayers";
import { clampCamera, fitCamera, scaleOf, zoomAt } from "../../helpers/replayCamera";
import { buildAtlas } from "./replaySprites";
import { zoneAt } from "./replayEngine";

const HIGH_RES_SOURCE_PX = 2048;
const HIGH_RES_TRIGGER = 0.7;
const FLASH_CAP = 40;

// Fetch the 2048 raster once the map is being sampled above ~70% of its native
// resolution. A fixed zoom constant cannot work: the break-even depends on the
// stage size AND on devicePixelRatio, so on a retina display it arrives at a
// much lower zoom than on a 1x one.
const needsHighRes = (v) =>
  Math.min(v.vw, v.vh) * v.dpr * v.cam.zoom > HIGH_RES_SOURCE_PX * HIGH_RES_TRIGGER;

// Mirrors :root's token defaults; only reached when no stylesheet is present.
const FALLBACK_COLORS = {
  focal: "rgb(120,247,168)",
  enemy: "rgb(214,217,238)",
  dead: "rgb(108,112,144)",
  tracer: "rgb(255,155,155)",
  zoneCurrent: "rgb(255,255,255)",
  zoneNext: "rgb(90,180,255)",
  outside: "rgba(40,90,200,0.28)",
  ring: "rgb(253,232,43)",
  label: "rgb(255,255,255)",
  band: "rgb(12,20,34)",
  warn: "rgb(255,143,60)",
  zoneRed: "rgb(255,59,48)",
  zoneStorm: "rgb(200,162,90)",
  zoneEmp: "rgb(143,107,255)",
  crate: "rgb(255,62,200)",
  flight: "rgb(79,216,255)",
};

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

const ReplayStage = ({ data, clockRef, focusedAccountId, onSelect, mapLabel, publish }) => {
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
    highResRequested: false,
    atlas: null,
    colors: { ...FALLBACK_COLORS },
    flashes: [],
    hoveredIndex: -1,
    pointers: new Map(),
    gesture: null,
    mapGen: 0,
    // Reused every frame by the layer selectors; never reallocated.
    shotBuf: [],
    zoneBuf: [],
    pkgBuf: [],
    layers: {},
  });

  const focusedRef = useRef(focusedAccountId);
  useEffect(() => { focusedRef.current = focusedAccountId; }, [focusedAccountId]);

  useEffect(() => {
    const v = view.current;
    v.mapGen += 1;
    v.cam = fitCamera(data.mapMax);
    v.bgDirty = true;
    v.flashes.length = 0;
    v.highResRequested = false;
    v.image = null;
    // Also invalidates an in-flight high-res load on unmount, so a late
    // onload with no map change finds a stale generation and drops itself.
    return () => { v.mapGen += 1; };
  }, [data.mapMax, data.rawMapName]);

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

  const requestHighRes = useCallback(() => {
    const v = view.current;
    if (v.highResRequested || typeof Image === "undefined") return;
    const url = highResUrl(data.rawMapName);
    if (!url) return;
    v.highResRequested = true;
    const gen = v.mapGen;
    const img = new Image();
    img.onload = () => {
      if (v.mapGen !== gen) return;
      v.image = img;
      v.bgDirty = true;
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
    if (needsHighRes(v)) requestHighRes();
  }, [requestHighRes]);

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
      v.cam = zoomAt(v.cam, v.vw, v.vh, v.cam.zoom * normaliseWheel(e), e.clientX - rect.left, e.clientY - rect.top);
      if (needsHighRes(v)) requestHighRes();
      v.bgDirty = true;
    };
    const blockGesture = (e) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", blockGesture, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", blockGesture);
    };
  }, [requestHighRes]);

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
            shots: shotWindow.activeAt(t, v.shotBuf),
            specialZones: specialZonesAt(data.specialZones, t, v.zoneBuf),
            packages: packagesAt(data.packages, t, v.pkgBuf),
            landings: data.landings,
            flightSeg,
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
        if (needsHighRes(v)) requestHighRes();
        v.bgDirty = true;
      }
    } else if (g.mode === "pan") {
      const s = scaleOf(v.cam, v.vw, v.vh);
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
  };

  const onPointerLeave = () => {
    view.current.hoveredIndex = -1;
  };

  const onDoubleClick = () => {
    const v = view.current;
    v.cam = clampCamera(fitCamera(v.cam.mapMax), v.vw, v.vh);
    v.bgDirty = true;
  };

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
    </div>
  );
};

export default ReplayStage;
