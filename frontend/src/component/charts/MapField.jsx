import React, { useRef, useState, useEffect } from "react";
import { getMapMeta } from "../../helpers/mapMeta";

export const clampZoom = (next, min = 1, max = 6) =>
  Math.min(max, Math.max(min, next));

const MapField = ({ rawMapName, className = "", children }) => {
  const meta = getMapMeta(rawMapName);
  const stageRef = useRef(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef(null);
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

  const onMouseDown = (e) => {
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: viewRef.current.x, baseY: viewRef.current.y };
  };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    setView((v) => ({
      ...v,
      x: drag.current.baseX + (e.clientX - drag.current.startX),
      y: drag.current.baseY + (e.clientY - drag.current.startY),
    }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={stageRef}
      className={`map-field ${className}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
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
