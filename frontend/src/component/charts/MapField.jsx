import React, { useRef, useState, useEffect } from "react";
import { getMapMeta } from "../../helpers/mapMeta";

export const clampZoom = (next, min = 1, max = 6) =>
  Math.min(max, Math.max(min, next));

const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const MapField = ({ rawMapName, className = "", children }) => {
  const meta = getMapMeta(rawMapName);
  const stageRef = useRef(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const viewRef = useRef(view);

  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        return { ...v, zoom: clampZoom(v.zoom * factor) };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Start a one-finger pan from the current pointer set (also used to resume
  // panning after one finger of a pinch lifts).
  const startPan = () => {
    const [only] = [...pointers.current.values()];
    if (!only) return;
    gesture.current = { mode: "pan", startX: only.x, startY: only.y, baseX: viewRef.current.x, baseY: viewRef.current.y };
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      gesture.current = { mode: "pinch", startDist: pointerDistance(pts[0], pts[1]), baseZoom: viewRef.current.zoom };
    } else {
      startPan();
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (g.mode === "pinch" && pts.length >= 2) {
      const dist = pointerDistance(pts[0], pts[1]);
      if (g.startDist > 0) setView((v) => ({ ...v, zoom: clampZoom(g.baseZoom * (dist / g.startDist)) }));
    } else if (g.mode === "pan") {
      setView((v) => ({ ...v, x: g.baseX + (e.clientX - g.startX), y: g.baseY + (e.clientY - g.startY) }));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (pointers.current.size === 1) startPan();
    else if (pointers.current.size === 0) gesture.current = null;
  };

  return (
    <div
      ref={stageRef}
      className={`map-field ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="map-field__viewport"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {meta.image ? (
          <img className="map-field__bg" src={meta.image} alt={meta.displayName} draggable={false} />
        ) : (
          <div className="map-field__bg map-field__bg--missing" />
        )}
        {children}
      </div>
    </div>
  );
};

export default MapField;
