import React, { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "antd";
import MapField from "../charts/MapField";
import { formatClock as fmt } from "../../helpers/formatClock";

const CANVAS_SIZE = 1000;

const KillMap = ({ kills = [], rawMapName, mapMax = 8160, duration = 0, t }) => {
  const canvasRef = useRef(null);
  const [range, setRange] = useState([0, duration || 0]);

  const visible = useMemo(
    () => kills.filter((k) => k.kx != null && k.vx != null && (k.t ?? 0) >= range[0] && (k.t ?? 0) <= range[1]),
    [kills, range]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const sx = (v) => (v / mapMax) * CANVAS_SIZE;
    for (const k of visible) {
      ctx.strokeStyle = k.isFocalKill ? "rgba(120,247,168,0.9)" : k.isFocalDeath ? "rgba(255,155,155,0.9)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = CANVAS_SIZE * 0.0022;
      ctx.beginPath();
      ctx.moveTo(sx(k.kx), sx(k.ky));
      ctx.lineTo(sx(k.vx), sx(k.vy));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx(k.vx), sx(k.vy), CANVAS_SIZE * 0.004, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }, [visible, mapMax]);

  return (
    <div className="kill-map">
      <div className="kill-map__stage">
        <MapField rawMapName={rawMapName} className="kill-map__field">
          <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="kill-map__canvas" />
        </MapField>
      </div>
      <div className="kill-map__range">
        <span>{t("pages.match.timeRange")}</span>
        <Slider
          range
          min={0}
          max={duration || 0}
          value={range}
          onChange={setRange}
          tooltip={{ formatter: (v) => fmt(v) }}
          style={{ flex: 1, minWidth: 180 }}
        />
      </div>
    </div>
  );
};

export default KillMap;
