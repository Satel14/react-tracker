import React, { useEffect, useMemo, useReducer } from "react";
import { Modal, Spin, Alert } from "antd";
import { LoadingOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { translate } from "react-switch-lang";
import { getMatchHeatmap } from "../../api/player";

const EVENT_COLORS = {
  drop: "#5ab4ff",
  kill: "#78f7a8",
  death: "#ff7b7b",
};

const formatSeconds = (sec) => {
  if (sec === null || sec === undefined) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const INITIAL_HEATMAP_STATE = { data: null, loading: false, error: null, hovered: null };

function heatmapReducer(state, action) {
  switch (action.type) {
    case "reset":
      return INITIAL_HEATMAP_STATE;
    case "loadStart":
      return { ...state, loading: true, error: null };
    case "loadSuccess":
      return { ...state, loading: false, error: null, data: action.data };
    case "loadError":
      return { ...state, loading: false, error: action.error };
    case "loadFinish":
      return state.loading ? { ...state, loading: false } : state;
    case "hover":
      return { ...state, hovered: action.hovered };
    default:
      return state;
  }
}

const MatchHeatmap = ({ open, onClose, matchId, shard, accountId, playerName, mapNameHint, rawMapNameHint, t }) => {
  const eventLabels = {
    drop: t("pages.matchHeatmap.tooltipDrop"),
    kill: t("pages.matchHeatmap.tooltipKill"),
    death: t("pages.matchHeatmap.tooltipDeath"),
  };
  const eventDotLabels = {
    drop: t("pages.matchHeatmap.labelDrop"),
    kill: t("pages.matchHeatmap.labelKill"),
    death: t("pages.matchHeatmap.labelDeath"),
  };
  const [{ data, loading, error, hovered }, dispatch] = useReducer(heatmapReducer, INITIAL_HEATMAP_STATE);
  const setHovered = (hovered) => dispatch({ type: "hover", hovered });

  useEffect(() => {
    if (!open || !matchId) {
      dispatch({ type: "reset" });
      return;
    }

    let cancelled = false;
    dispatch({ type: "loadStart" });

    getMatchHeatmap(matchId, shard, accountId, playerName)
      .then((response) => {
        if (cancelled) return;
        const payload = response?.data?.data || response?.data || null;
        if (response?.data?.message && !payload) {
          dispatch({ type: "loadError", error: response.data.message });
        } else if (payload && payload.events) {
          dispatch({ type: "loadSuccess", data: payload });
        } else {
          dispatch({ type: "loadError", error: t("pages.matchHeatmap.errorUnavailable") });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        dispatch({ type: "loadError", error: err?.message || t("pages.matchHeatmap.errorGeneric") });
      })
      .finally(() => {
        if (!cancelled) dispatch({ type: "loadFinish" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matchId, shard, accountId, playerName]);

  const mapSize = data?.mapSize || 8000;
  const mapDisplayName = data?.mapName || mapNameHint || t("pages.matchHeatmap.fallbackMapName");
  const rawMap = data?.rawMapName || rawMapNameHint || null;
  const events = useMemo(() => (Array.isArray(data?.events) ? data.events : []), [data]);

  const counts = events.reduce(
    (acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    },
    { drop: 0, kill: 0, death: 0 }
  );

  const clusters = useMemo(() => {
    const CLUSTER_RADIUS_M = 80;
    const groups = [];
    events.forEach((event) => {
      const existing = groups.find(
        (group) =>
          group.type === event.type &&
          Math.hypot(group.x - event.x, group.y - event.y) <= CLUSTER_RADIUS_M
      );
      if (existing) {
        existing.count += 1;
        existing.items.push(event);
      } else {
        groups.push({ type: event.type, x: event.x, y: event.y, count: 1, items: [event] });
      }
    });
    return groups;
  }, [events]);

  const viewBox = useMemo(() => {
    if (!events.length) return { x: 0, y: 0, size: mapSize };
    const xs = events.map((event) => event.x);
    const ys = events.map((event) => event.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    const baseExtent = Math.max(width, height);
    const padding = Math.max(baseExtent * 0.4, 600);
    const finalSize = Math.min(mapSize, Math.max(baseExtent + padding * 2, 1500));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let x = cx - finalSize / 2;
    let y = cy - finalSize / 2;

    x = Math.max(0, Math.min(mapSize - finalSize, x));
    y = Math.max(0, Math.min(mapSize - finalSize, y));

    return { x, y, size: finalSize };
  }, [events, mapSize]);

  const scale = viewBox.size;

  const insights = useMemo(() => {
    if (!events.length) return [];
    const drop = events.find((event) => event.type === "drop");
    const death = events.find((event) => event.type === "death");
    const kills = events.filter((event) => event.type === "kill");
    const lines = [];

    if (drop && death) {
      const distance = Math.round(Math.hypot(drop.x - death.x, drop.y - death.y));
      const distanceLabel = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`;
      lines.push(t("pages.matchHeatmap.storyTravel", { distance: distanceLabel }));
    }

    if (kills.length && death) {
      const killsBeforeDeath = kills.filter(
        (kill) => kill.time !== null && death.time !== null && kill.time <= death.time
      );
      if (killsBeforeDeath.length === 1) {
        lines.push(t("pages.matchHeatmap.storyKillsBeforeOne"));
      } else if (killsBeforeDeath.length > 1) {
        lines.push(t("pages.matchHeatmap.storyKillsBeforeMany", { count: killsBeforeDeath.length }));
      }
    } else if (kills.length && !death) {
      if (kills.length === 1) {
        lines.push(t("pages.matchHeatmap.storySurvivedOne"));
      } else {
        lines.push(t("pages.matchHeatmap.storySurvivedMany", { count: kills.length }));
      }
    } else if (!kills.length && death) {
      lines.push(t("pages.matchHeatmap.storyNoKills"));
    }

    if (death && death.time !== null && death.time !== undefined) {
      const m = Math.floor(death.time / 60);
      const s = death.time % 60;
      lines.push(t("pages.matchHeatmap.storyDiedAt", { time: `${m}:${String(s).padStart(2, "0")}` }));
    } else if (!death && events.length > 0) {
      lines.push(t("pages.matchHeatmap.storyAlive"));
    }

    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      destroyOnHidden
      className="match-heatmap-modal"
      title={t("pages.matchHeatmap.modalTitle", { map: mapDisplayName })}
    >
      <div className="match-heatmap__legend">
        <span style={{ color: EVENT_COLORS.kill }}>● {t("pages.matchHeatmap.legendKills")}: {counts.kill || 0}</span>
        <span style={{ color: EVENT_COLORS.death }}>● {t("pages.matchHeatmap.legendDeaths")}: {counts.death || 0}</span>
        <span style={{ color: EVENT_COLORS.drop }}>● {t("pages.matchHeatmap.legendDrop")}: {counts.drop || 0}</span>
      </div>

      <details className="match-heatmap__help">
        <summary>
          <InfoCircleOutlined /> {t("pages.matchHeatmap.helpToggle")}
        </summary>
        <div className="match-heatmap__help-body">
          <p>{t("pages.matchHeatmap.helpIntro")}</p>
          <ul>
            <li><span style={{ color: EVENT_COLORS.drop }}>●</span> {t("pages.matchHeatmap.helpDrop")}</li>
            <li><span style={{ color: EVENT_COLORS.kill }}>●</span> {t("pages.matchHeatmap.helpKill")}</li>
            <li><span style={{ color: EVENT_COLORS.death }}>●</span> {t("pages.matchHeatmap.helpDeath")}</li>
            <li>{t("pages.matchHeatmap.helpPath")}</li>
            <li>{t("pages.matchHeatmap.helpCompass")}</li>
          </ul>
          <p>{t("pages.matchHeatmap.helpHover")}</p>
        </div>
      </details>

      <div className="match-heatmap__stage">
        {loading ? (
          <div className="match-heatmap__loading">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: "#fde82b" }} spin />} />
            <span>{t("pages.matchHeatmap.loading")}</span>
          </div>
        ) : error ? (
          <Alert type="error" message={error} showIcon />
        ) : (
          <div className={`match-heatmap__canvas match-heatmap__canvas--${(rawMap || "").toLowerCase()}`}>
            <svg
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.size} ${viewBox.size}`}
              className="match-heatmap__svg"
            >
              <defs>
                <radialGradient id="heatmap-bg" cx="50%" cy="50%" r="65%">
                  <stop offset="0%" stopColor="rgba(120, 247, 168, 0.08)" />
                  <stop offset="100%" stopColor="rgba(8, 14, 24, 0)" />
                </radialGradient>
              </defs>
              <rect x={viewBox.x} y={viewBox.y} width={viewBox.size} height={viewBox.size} fill="url(#heatmap-bg)" />

              {(() => {
                const gridStep = viewBox.size > 4000 ? 1000 : viewBox.size > 2000 ? 500 : 250;
                const startX = Math.floor(viewBox.x / gridStep) * gridStep;
                const endX = viewBox.x + viewBox.size;
                const startY = Math.floor(viewBox.y / gridStep) * gridStep;
                const endY = viewBox.y + viewBox.size;
                const lines = [];
                for (let x = startX; x <= endX; x += gridStep) {
                  lines.push(
                    <line
                      key={`vx-${x}`}
                      x1={x}
                      y1={viewBox.y}
                      x2={x}
                      y2={viewBox.y + viewBox.size}
                      stroke="rgba(120, 247, 168, 0.12)"
                      strokeWidth={scale * 0.0008}
                    />
                  );
                }
                for (let y = startY; y <= endY; y += gridStep) {
                  lines.push(
                    <line
                      key={`hy-${y}`}
                      x1={viewBox.x}
                      y1={y}
                      x2={viewBox.x + viewBox.size}
                      y2={y}
                      stroke="rgba(120, 247, 168, 0.12)"
                      strokeWidth={scale * 0.0008}
                    />
                  );
                }
                return lines;
              })()}

              <rect
                x={viewBox.x + scale * 0.005}
                y={viewBox.y + scale * 0.005}
                width={viewBox.size - scale * 0.01}
                height={viewBox.size - scale * 0.01}
                fill="none"
                stroke="rgba(120, 247, 168, 0.25)"
                strokeWidth={scale * 0.0014}
              />

              <text
                x={viewBox.x + viewBox.size / 2}
                y={viewBox.y + scale * 0.045}
                fill="rgba(120, 247, 168, 0.6)"
                fontSize={scale * 0.035}
                fontWeight="700"
                textAnchor="middle"
              >N</text>
              <text
                x={viewBox.x + viewBox.size / 2}
                y={viewBox.y + viewBox.size - scale * 0.018}
                fill="rgba(120, 247, 168, 0.6)"
                fontSize={scale * 0.035}
                fontWeight="700"
                textAnchor="middle"
              >S</text>
              <text
                x={viewBox.x + scale * 0.022}
                y={viewBox.y + viewBox.size / 2}
                fill="rgba(120, 247, 168, 0.6)"
                fontSize={scale * 0.035}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >W</text>
              <text
                x={viewBox.x + viewBox.size - scale * 0.022}
                y={viewBox.y + viewBox.size / 2}
                fill="rgba(120, 247, 168, 0.6)"
                fontSize={scale * 0.035}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >E</text>

              {(() => {
                const timeline = events
                  .filter((event) => event.time !== null && event.time !== undefined)
                  .slice()
                  .sort((a, b) => (a.time || 0) - (b.time || 0));

                if (timeline.length < 2) return null;
                const points = timeline.map((event) => `${event.x},${event.y}`).join(" ");
                return (
                  <polyline
                    points={points}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.4)"
                    strokeWidth={scale * 0.003}
                    strokeDasharray={`${scale * 0.012} ${scale * 0.008}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}

              {clusters.map((cluster) => {
                const baseRadius = cluster.type === "drop" ? scale * 0.028 : scale * 0.024;
                const sizeBoost = Math.min(cluster.count - 1, 3) * 0.4;
                const radius = baseRadius * (1 + sizeBoost);
                const firstEvent = cluster.items[0];
                const baseLabel = eventDotLabels[cluster.type] || cluster.type.toUpperCase();
                const labelText =
                  cluster.type === "kill" && cluster.count > 1
                    ? `${baseLabel} ×${cluster.count}`
                    : baseLabel;
                const clusterKey = `${cluster.type}-${cluster.x.toFixed(2)}-${cluster.y.toFixed(2)}`;
                return (
                  <g key={clusterKey}>
                    <circle
                      cx={cluster.x}
                      cy={cluster.y}
                      r={radius * 2.4}
                      fill={EVENT_COLORS[cluster.type]}
                      opacity="0.16"
                    />
                    <circle
                      cx={cluster.x}
                      cy={cluster.y}
                      r={radius * 1.5}
                      fill={EVENT_COLORS[cluster.type]}
                      opacity="0.32"
                    />
                    <circle
                      cx={cluster.x}
                      cy={cluster.y}
                      r={radius}
                      fill={EVENT_COLORS[cluster.type]}
                      stroke="#0c1018"
                      strokeWidth={scale * 0.0024}
                      onMouseEnter={() => setHovered({ event: firstEvent, cluster })}
                      onMouseLeave={() => setHovered(null)}
                      style={{ cursor: "pointer" }}
                    />
                    {cluster.count > 1 ? (
                      <text
                        x={cluster.x}
                        y={cluster.y}
                        fill="#0c1018"
                        fontSize={radius * 1.0}
                        fontWeight="800"
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ pointerEvents: "none" }}
                      >
                        ×{cluster.count}
                      </text>
                    ) : null}
                    <text
                      x={cluster.x}
                      y={cluster.y + radius * 2 + scale * 0.018}
                      fill="#fff"
                      fontSize={scale * 0.026}
                      fontWeight="700"
                      letterSpacing="1"
                      textAnchor="middle"
                      stroke="#0c1018"
                      strokeWidth={scale * 0.004}
                      paintOrder="stroke"
                      style={{ pointerEvents: "none" }}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hovered ? (
              <div className="match-heatmap__tooltip">
                <strong style={{ color: EVENT_COLORS[hovered.event.type] }}>
                  {eventLabels[hovered.event.type]}
                  {hovered.cluster && hovered.cluster.count > 1 ? ` ×${hovered.cluster.count}` : ""}
                </strong>
                {hovered.cluster && hovered.cluster.count > 1 ? (
                  hovered.cluster.items.slice(0, 5).map((item) => {
                    const opponent = item.victim
                      ? t("pages.matchHeatmap.tooltipVs", { name: item.victim })
                      : item.killer
                        ? t("pages.matchHeatmap.tooltipBy", { name: item.killer })
                        : null;
                    const weapon = item.weapon ? item.weapon.replace(/^WeapHK_C$|^Item_Weapon_/i, "") : null;
                    const itemKey = `${item.victim || item.killer || ""}-${item.weapon || ""}-${item.distance ?? ""}-${item.time ?? ""}`;
                    return (
                      <div key={itemKey}>
                        {opponent}
                        {weapon ? ` - ${weapon}` : null}
                        {item.distance ? ` (${item.distance}m)` : null}
                      </div>
                    );
                  })
                ) : (
                  <>
                    {hovered.event.victim ? <div>{t("pages.matchHeatmap.tooltipVs", { name: hovered.event.victim })}</div> : null}
                    {hovered.event.killer ? <div>{t("pages.matchHeatmap.tooltipBy", { name: hovered.event.killer })}</div> : null}
                    {hovered.event.weapon ? <div>{hovered.event.weapon.replace(/^WeapHK_C$|^Item_Weapon_/i, "")}</div> : null}
                    {hovered.event.distance ? <div>{hovered.event.distance}m</div> : null}
                    {hovered.event.time !== null && hovered.event.time !== undefined ? (
                      <div>{formatSeconds(hovered.event.time)}</div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {insights.length ? (
        <div className="match-heatmap__insights">
          <strong>{t("pages.matchHeatmap.storyTitle")}</strong>
          <ul>
            {insights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
};

export default translate(MatchHeatmap);
