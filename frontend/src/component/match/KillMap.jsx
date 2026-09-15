import React, { useCallback, useMemo } from "react";
import MapStage from "../charts/MapStage";
import { worldToScreen } from "../../helpers/replayCamera";

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

// A pointed-at tracer is drawn thicker rather than in a colour of its own: the
// three colours here already mean something (my kill, my death, everyone
// else's), and a fourth would overwrite that meaning to say "hovered".
const FOCUS_SCALE = 2.2;
const DIMMED = 0.25;

// The list arrives already filtered -- KillsPane owns the time range and the
// All/Mine switch, because the feed beside this map has to narrow with it.
const KillMap = ({ kills = [], rawMapName, highlightId = null, t }) => {
  const visible = useMemo(
    () => kills.filter((k) => k.kx != null && k.vx != null),
    [kills],
  );

  // Rebuilt whenever the list or the pointed-at kill changes, which is what
  // makes MapStage repaint.
  const paint = useCallback((ctx, { cam, vw, vh }) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const draw = (k, strong) => {
      const from = worldToScreen(cam, vw, vh, k.kx, k.ky);
      const to = worldToScreen(cam, vw, vh, k.vx, k.vy);
      const colour = k.isFocalKill ? FOCAL_KILL : k.isFocalDeath ? FOCAL_DEATH : OTHER;
      const width = strong ? LINE_WIDTH * FOCUS_SCALE : LINE_WIDTH;
      const radius = strong ? DOT_RADIUS * 1.8 : DOT_RADIUS;

      // Cut out of the raster the same way every marker is: a pale tracer over
      // Miramar sand is otherwise a tracer nobody can see.
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = width + HALO;
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.stroke();

      // The dot marks where the victim fell, which is the end of the line that
      // matters -- the other end is only where it came from.
      ctx.beginPath();
      ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    // The rest first and faded, so the pointed-at tracer is painted last and
    // lands on top of whatever crosses it. `== null` rather than a falsy check:
    // id 0 is the match's first kill.
    ctx.globalAlpha = highlightId == null ? 1 : DIMMED;
    for (const k of visible) if (k.id !== highlightId) draw(k, false);
    ctx.globalAlpha = 1;

    const focus = highlightId == null ? null : visible.find((k) => k.id === highlightId);
    if (focus) draw(focus, true);
  }, [visible, highlightId]);

  return (
    <div className="kill-map">
      {/* No label override: MapStage names itself after the map, and the tab
          around it already says these are kills. */}
      <MapStage rawMapName={rawMapName} paint={paint} className="kill-map__stage" />
      <div className="kill-map__hint">{t("pages.replay.hint")}</div>
    </div>
  );
};

export default KillMap;
