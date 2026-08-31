import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { getMapMeta, highResUrl, HIGH_RES_SIZES, wantedRasterTier } from "../../helpers/mapMeta";
import { drawBackground } from "../../helpers/replayScene";
import { clampCamera, fitCamera, zoomAt, MAX_ZOOM, MIN_ZOOM } from "../../helpers/replayCamera";

// A pannable, zoomable map with a canvas over it, for the surfaces that are not
// the replay.
//
// The replay keeps its own stage: that one carries a clock, tracks, layers,
// follow and fullscreen, and pulling it apart to share would be a far riskier
// change than sharing the pieces underneath. What IS shared is everything that
// makes its zoom good -- the camera maths (replayCamera), the raster blit
// (drawBackground) and the tier rule (mapMeta.wantedRasterTier). Those are the
// parts a fixed-resolution canvas scaled by CSS cannot do, which is why the
// kill map went soft the moment anyone zoomed in.
//
// `paint` is handed the live camera whenever the view changes and draws in
// SCREEN space, so its marks are redrawn at the new scale rather than
// magnified. That is the whole point.

const DOUBLE_CLICK_ZOOM = 2;
// Past this the gesture was a drag, not a click, and must not be read as one.
const MOVE_SLOP = 6;

const MapStage = ({ rawMapName, paint, className = "", bandColor = "rgb(16,25,40)", label }) => {
  const wrapRef = useRef(null);
  const bgRef = useRef(null);
  const fxRef = useRef(null);
  const meta = useMemo(() => getMapMeta(rawMapName), [rawMapName]);
  const view = useRef({
    cam: fitCamera(meta.mapMax),
    vw: 0,
    vh: 0,
    dpr: 1,
    image: null,
    tier: 0,
    gen: 0,
    drag: null,
    moved: 0,
  });

  // Redrawn on demand rather than every animation frame: nothing here moves on
  // its own, so a frame loop would burn a core to show a still picture.
  const render = useCallback(() => {
    const v = view.current;
    const bg = bgRef.current;
    const fx = fxRef.current;
    if (!bg || !fx || !v.vw || !v.vh) return;
    const bgCtx = bg.getContext("2d");
    const fxCtx = fx.getContext("2d");
    if (bgCtx) drawBackground(bgCtx, { cam: v.cam, vw: v.vw, vh: v.vh, image: v.image, bandColor });
    if (fxCtx) {
      fxCtx.clearRect(0, 0, v.vw, v.vh);
      if (typeof paint === "function") paint(fxCtx, { cam: v.cam, vw: v.vw, vh: v.vh });
    }
  }, [paint, bandColor]);

  const requestTier = useCallback(() => {
    const v = view.current;
    if (typeof Image === "undefined") return;
    const want = wantedRasterTier({ vw: v.vw, vh: v.vh, dpr: v.dpr, zoom: v.cam.zoom });
    if (want <= v.tier) return;
    const size = HIGH_RES_SIZES[Math.min(want, HIGH_RES_SIZES.length) - 1];
    const url = highResUrl(rawMapName, size);
    if (!url) return;
    // Climb one at a time and never back down: a coarser raster arriving late
    // must not replace a sharper one already on screen.
    const climbing = v.tier + 1;
    v.tier = climbing;
    const gen = v.gen;
    const img = new Image();
    img.onload = () => {
      if (view.current.gen !== gen) return;
      view.current.image = img;
      render();
    };
    img.onerror = () => {
      // Not there; step back so a later zoom retries this tier rather than the
      // map being stuck on the base raster forever.
      if (view.current.gen === gen && view.current.tier === climbing) view.current.tier = climbing - 1;
    };
    img.src = url;
  }, [rawMapName, render]);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const v = view.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const vw = Math.max(1, Math.round(rect.width));
    const vh = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(3, Math.max(1, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
    v.vw = vw;
    v.vh = vh;
    v.dpr = dpr;
    for (const canvas of [bgRef.current, fxRef.current]) {
      if (!canvas) continue;
      const w = Math.round(vw * dpr);
      const h = Math.round(vh * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    v.cam = clampCamera(v.cam, vw, vh);
    requestTier();
    render();
  }, [requestTier, render]);

  // A new map is a new camera, a new raster and a new generation, so a tier
  // still in flight for the old one cannot land on top of it.
  useEffect(() => {
    const v = view.current;
    v.gen += 1;
    v.cam = fitCamera(meta.mapMax);
    v.image = null;
    v.tier = 0;
    if (typeof Image !== "undefined" && meta.image) {
      const gen = v.gen;
      const img = new Image();
      img.onload = () => {
        if (view.current.gen !== gen) return;
        view.current.image = img;
        render();
      };
      img.src = meta.image;
    }
    measure();
  }, [meta.mapMax, meta.image, measure, render]);

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !wrapRef.current) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // The caller's paint changes between renders -- a new time range, a new
  // filter -- and the picture has to follow it.
  useEffect(() => {
    render();
  }, [render]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const v = view.current;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = Math.max(-120, Math.min(120, e.deltaY * unit));
    const factor = Math.exp(-dy * (e.ctrlKey ? 0.02 : 0.0025));
    const next = zoomAt(v.cam, v.vw, v.vh, v.cam.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    if (next === v.cam) return;
    v.cam = next;
    requestTier();
    render();
  }, [requestTier, render]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    // Not React's onWheel: that one is passive, so preventDefault does nothing
    // and the page scrolls out from under the map.
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onPointerDown = useCallback((e) => {
    const v = view.current;
    v.drag = { x: e.clientX, y: e.clientY, cam: v.cam };
    v.moved = 0;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    const v = view.current;
    if (!v.drag) return;
    const dx = e.clientX - v.drag.x;
    const dy = e.clientY - v.drag.y;
    v.moved = Math.max(v.moved, Math.abs(dx) + Math.abs(dy));
    const base = v.drag.cam.mapMax > 0 ? Math.min(v.vw, v.vh) / v.drag.cam.mapMax : 0;
    const s = base * v.drag.cam.zoom;
    if (!s) return;
    v.cam = clampCamera(
      { ...v.drag.cam, cx: v.drag.cam.cx - dx / s, cy: v.drag.cam.cy - dy / s },
      v.vw,
      v.vh,
    );
    render();
  }, [render]);

  const onPointerUp = useCallback(() => {
    view.current.drag = null;
  }, []);

  const onDoubleClick = useCallback((e) => {
    const v = view.current;
    if (v.moved > MOVE_SLOP) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Zoomed in at all, a double-click fits the map back; at the fit it steps
    // in on the point under the cursor.
    if (v.cam.zoom > MIN_ZOOM) {
      v.cam = clampCamera(fitCamera(v.cam.mapMax), v.vw, v.vh);
    } else {
      const next = Math.min(MAX_ZOOM, v.cam.zoom * DOUBLE_CLICK_ZOOM);
      v.cam = zoomAt(v.cam, v.vw, v.vh, next, e.clientX - rect.left, e.clientY - rect.top);
    }
    requestTier();
    render();
  }, [requestTier, render]);

  return (
    <div
      ref={wrapRef}
      className={`map-stage ${className}`.trim()}
      role="img"
      aria-label={label || meta.displayName || rawMapName}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={bgRef} className="map-stage__bg" />
      <canvas ref={fxRef} className="map-stage__fx" />
    </div>
  );
};

export default MapStage;
