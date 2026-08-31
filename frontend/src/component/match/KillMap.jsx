import React, { useCallback, useMemo, useState } from "react";
import { Slider } from "antd";
import MapStage from "../charts/MapStage";
import { worldToScreen } from "../../helpers/replayCamera";
import { formatClock as fmt } from "../../helpers/formatClock";

// Line and dot sizes are CSS pixels and are NOT multiplied by the camera scale:
// a tracer that thickened with zoom would swallow the ground it is drawn over,
// which is the same rule the replay's own marks follow.
const LINE_WIDTH = 1.6;
const DOT_RADIUS = 3;
const HALO = 3;
const OUTLINE = "rgb(20,18,30)";
const FOCAL_KILL = "rgba(120,247,168,0.95)";
const FOCAL_DEATH = "rgba(255,155,155,0.95)";
const OTHER = "rgba(235,238,248,0.6)";

const KillMap = ({ kills = [], rawMapName, duration = 0, t }) => {
  const [range, setRange] = useState([0, duration || 0]);

  const visible = useMemo(
    () => kills.filter((k) => k.kx != null && k.vx != null && (k.t ?? 0) >= range[0] && (k.t ?? 0) <= range[1]),
    [kills, range],
  );

  // Rebuilt whenever the window moves, which is what makes MapStage repaint.
  const paint = useCallback((ctx, { cam, vw, vh }) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const k of visible) {
      const from = worldToScreen(cam, vw, vh, k.kx, k.ky);
      const to = worldToScreen(cam, vw, vh, k.vx, k.vy);
      const colour = k.isFocalKill ? FOCAL_KILL : k.isFocalDeath ? FOCAL_DEATH : OTHER;

      // Cut out of the raster the same way every marker is: a pale tracer over
      // Miramar sand is otherwise a tracer nobody can see.
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = LINE_WIDTH + HALO;
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = LINE_WIDTH;
      ctx.stroke();

      // The dot marks where the victim fell, which is the end of the line that
      // matters -- the other end is only where it came from.
      ctx.beginPath();
      ctx.arc(to.x, to.y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [visible]);

  return (
    <div className="kill-map">
      {/* No label override: MapStage names itself after the map, and the tab
          around it already says these are kills. */}
      <MapStage rawMapName={rawMapName} paint={paint} className="kill-map__stage" />
      <div className="kill-map__hint">{t("pages.replay.hint")}</div>
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
