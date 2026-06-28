import React, { useEffect, useReducer, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Spin, Alert, Button, Slider, Segmented } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { translate } from "react-switch-lang";
import MapField from "../component/charts/MapField";
import { getMatchReplay } from "../api/player";
import { useReplayClock } from "../component/charts/useReplayClock";
import { playersAt, activeKills, zoneAt } from "../component/charts/replayEngine";
import { drawReplayFrame } from "../component/charts/replayDraw";

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const SPEEDS = [1, 2, 4, 8, 16];

const INITIAL = { loading: false, error: null, data: null };

function reducer(state, action) {
  switch (action.type) {
    case "start": return { ...state, loading: true, error: null };
    case "ok": return { loading: false, error: null, data: action.data };
    case "err": return { loading: false, error: action.error, data: null };
    default: return state;
  }
}

const CANVAS_SIZE = 1000;

const MatchReplayPage = ({ t }) => {
  const { platform, matchId } = useParams();
  const [search] = useSearchParams();
  const accountId = search.get("accountId");
  const playerName = search.get("playerName");
  const [{ loading, error, data }, dispatch] = useReducer(reducer, INITIAL);
  const canvasRef = useRef(null);
  const clock = useReplayClock(data?.duration || 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const players = playersAt(data.players, clock.t);
    const kills = activeKills(data.kills, clock.t);
    const zone = zoneAt(data.zones, clock.t);
    drawReplayFrame(ctx, { players, kills, zone, mapMax: data.mapMax, size: CANVAS_SIZE });
  }, [data, clock.t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") { e.preventDefault(); clock.toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clock]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    getMatchReplay(matchId, platform, accountId, playerName)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || null;
        if (payload && Array.isArray(payload.players)) dispatch({ type: "ok", data: payload });
        else dispatch({ type: "err", error: res?.message || t("pages.replay.errorUnavailable") });
      })
      .catch((e) => {
        if (!cancelled) dispatch({ type: "err", error: e?.message || t("pages.replay.errorGeneric") });
      });
    return () => { cancelled = true; };
  }, [matchId, platform, accountId, playerName, t]);

  return (
    <div className="match-replay">
      <h2 className="match-replay__title">
        {t("pages.replay.title")}{data ? ` — ${data.mapName}` : ""}
      </h2>
      {loading ? (
        <div className="match-replay__loading">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: "#fde82b" }} spin />} />
          <span>{t("pages.replay.loading")}</span>
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <div className="match-replay__stage">
          <MapField rawMapName={data.rawMapName} className="match-replay__field">
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="match-replay__canvas" />
          </MapField>
          <div className="match-replay__controls">
            <Button onClick={clock.toggle}>
              {clock.playing ? t("pages.replay.pause") : t("pages.replay.play")}
            </Button>
            <Slider
              className="match-replay__scrubber"
              style={{ flex: 1, minWidth: 180 }}
              min={0}
              max={data.duration || 0}
              value={Math.floor(clock.t)}
              onChange={clock.seek}
              tooltip={{ formatter: (v) => fmt(v) }}
            />
            <span className="match-replay__time">{fmt(clock.t)} / {fmt(data.duration || 0)}</span>
            <Segmented
              value={clock.speed}
              onChange={clock.setSpeed}
              options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default translate(MatchReplayPage);
