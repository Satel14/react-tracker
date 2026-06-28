import React, { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Spin } from "antd";
import MapField from "./MapField";
import { drawHeat, buildGradient, DEFAULT_STOPS } from "./heatLayer";
import { getAggregateHeatmap } from "../../api/player";

const CANVAS_SIZE = 1000;
const LAYER_KEYS = ["drop", "kill", "death"];

const AggregateHeatmap = ({ rawMapName, matches = [], shard, accountId, playerName, t }) => {
  const canvasRef = useRef(null);
  const gradientRef = useRef(null);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [active, setActive] = useState({ drop: true, kill: true, death: false });

  const matchIds = useMemo(
    () => matches.filter((m) => m && m.rawMapName === rawMapName).map((m) => m.id),
    [matches, rawMapName]
  );
  const matchIdsKey = matchIds.join(",");

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    getAggregateHeatmap({ shard, accountId, playerName, map: rawMapName, matchIds })
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || null;
        if (payload && payload.layers) setState({ loading: false, data: payload, error: null });
        else setState({ loading: false, data: null, error: res?.message || "unavailable" });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, data: null, error: err?.message || "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [rawMapName, shard, accountId, playerName, matchIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!gradientRef.current) gradientRef.current = buildGradient(DEFAULT_STOPS);
    const points = LAYER_KEYS.filter((k) => active[k]).flatMap((k) => state.data.layers[k] || []);
    drawHeat(ctx, points, {
      size: CANVAS_SIZE,
      mapMax: state.data.mapMax,
      radius: 16,
      gradient: gradientRef.current,
    });
  }, [state.data, active]);

  return (
    <div className="aggregate-heatmap">
      <div className="aggregate-heatmap__controls">
        {LAYER_KEYS.map((k) => (
          <Checkbox key={k} checked={active[k]} onChange={(e) => setActive((a) => ({ ...a, [k]: e.target.checked }))}>
            {t(`pages.maps.layer${k.charAt(0).toUpperCase() + k.slice(1)}`)}
          </Checkbox>
        ))}
        {state.data ? <span className="aggregate-heatmap__count">{t("pages.maps.sampleCount", { count: state.data.matchesCount })}</span> : null}
      </div>

      {state.loading ? (
        <div className="aggregate-heatmap__loading"><Spin /></div>
      ) : state.data && state.data.matchesCount > 0 ? (
        <MapField rawMapName={rawMapName} className="aggregate-heatmap__field">
          <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="aggregate-heatmap__canvas" />
        </MapField>
      ) : (
        <p className="aggregate-heatmap__empty">{t("pages.maps.aggregateEmpty")}</p>
      )}
    </div>
  );
};

export default AggregateHeatmap;
