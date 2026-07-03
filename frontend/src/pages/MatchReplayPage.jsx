import React, { useEffect, useReducer, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Spin, Alert, Button, Slider, Segmented, Tabs } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { translate } from "react-switch-lang";
import MapField from "../component/charts/MapField";
import ReplayRoster from "../component/charts/ReplayRoster";
import MatchScoreboard from "../component/match/MatchScoreboard";
import KillFeed from "../component/match/KillFeed";
import KillMap from "../component/match/KillMap";
import DamageBreakdown from "../component/match/DamageBreakdown";
import CombatTimeline from "../component/match/CombatTimeline";
import { getMatchReplay, getMatchAnalysis } from "../api/player";
import { useReplayClock } from "../component/charts/useReplayClock";
import { playersAt, activeKills, zoneAt, rosterAt } from "../component/charts/replayEngine";
import { drawReplayFrame } from "../component/charts/replayDraw";

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const SPEEDS = [1, 2, 4, 8, 16];
const CANVAS_SIZE = 1000;
const INITIAL = { loading: false, error: null, data: null };

function reducer(state, action) {
  switch (action.type) {
    case "start": return { ...state, loading: true, error: null };
    case "ok": return { loading: false, error: null, data: action.data };
    case "err": return { loading: false, error: action.error, data: null };
    default: return state;
  }
}

const MatchReplayPage = ({ t }) => {
  const { platform, matchId } = useParams();
  const [search] = useSearchParams();
  const accountId = search.get("accountId");
  const playerName = search.get("playerName");
  const backTo =
    playerName || accountId
      ? `/player/${platform}/${encodeURIComponent(playerName || accountId)}`
      : "/";
  const [{ loading, error, data }, dispatch] = useReducer(reducer, INITIAL);
  const [focusedAccountId, setFocusedAccountId] = useState(null);
  const [tab, setTab] = useState("replay");
  const [analysis, setAnalysis] = useState({ loading: false, error: null, data: null, requested: false });
  const canvasRef = useRef(null);
  const clock = useReplayClock(data?.duration || 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || tab !== "replay") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const players = playersAt(data.players, clock.t);
    const kills = activeKills(data.kills, clock.t);
    const zone = zoneAt(data.zones, clock.t);
    drawReplayFrame(ctx, { players, kills, zone, mapMax: data.mapMax, size: CANVAS_SIZE, focusedAccountId });
  }, [data, clock.t, focusedAccountId, tab]);

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

  // Lazily fetch analysis the first time a non-replay tab is opened.
  useEffect(() => {
    if (tab === "replay" || analysis.requested) return;
    let cancelled = false;
    setAnalysis((a) => ({ ...a, loading: true, requested: true, error: null }));
    getMatchAnalysis(matchId, platform, accountId, playerName)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || null;
        if (payload && payload.scoreboard) setAnalysis({ loading: false, error: null, data: payload, requested: true });
        else setAnalysis({ loading: false, error: res?.message || t("pages.match.error"), data: null, requested: true });
      })
      .catch((e) => {
        if (!cancelled) setAnalysis({ loading: false, error: e?.message || t("pages.match.error"), data: null, requested: true });
      });
    return () => { cancelled = true; };
  }, [tab, analysis.requested, matchId, platform, accountId, playerName, t]);

  const renderReplay = () => (
    <>
      <div className="match-replay__layout">
        <div className="match-replay__stage">
          <MapField rawMapName={data.rawMapName} className="match-replay__field">
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="match-replay__canvas" />
          </MapField>
        </div>
        <ReplayRoster
          rows={rosterAt(data.players, data.kills, clock.t)}
          focusedAccountId={focusedAccountId}
          onSelect={setFocusedAccountId}
          t={t}
        />
      </div>
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
    </>
  );

  const renderAnalysisPane = (child) => {
    if (analysis.loading) {
      return (
        <div className="match-replay__loading">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: "#fde82b" }} spin />} />
          <span>{t("pages.match.loading")}</span>
        </div>
      );
    }
    if (analysis.error) return <Alert type="error" message={analysis.error} showIcon />;
    if (!analysis.data) return null;
    return child(analysis.data);
  };

  const tabItems = data
    ? [
        { key: "replay", label: t("pages.match.tabReplay"), children: renderReplay() },
        {
          key: "scoreboard",
          label: t("pages.match.tabScoreboard"),
          children: renderAnalysisPane((a) => (
            <MatchScoreboard scoreboard={a.scoreboard} platform={platform} t={t} />
          )),
        },
        {
          key: "kills",
          label: t("pages.match.tabKills"),
          children: renderAnalysisPane((a) => (
            <>
              <KillMap kills={a.killFeed} rawMapName={a.rawMapName} mapMax={a.mapMax} duration={a.duration} t={t} />
              <KillFeed kills={a.killFeed} t={t} />
            </>
          )),
        },
        {
          key: "damage",
          label: t("pages.match.tabDamage"),
          children: renderAnalysisPane((a) => (
            <DamageBreakdown damage={a.damage} focalPresent={!!a.focalAccountId} t={t} />
          )),
        },
        {
          key: "timeline",
          label: t("pages.match.tabTimeline"),
          children: renderAnalysisPane((a) => (
            <CombatTimeline timeline={a.timeline} focalPresent={!!a.focalAccountId} t={t} />
          )),
        },
      ]
    : [];

  return (
    <div className="match-replay">
      <Link className="match-replay__back" to={backTo}>{t("pages.replay.back")}</Link>
      <h2 className="match-replay__title">
        {t("pages.match.title")}{data ? ` — ${data.mapName}` : ""}
      </h2>
      {loading ? (
        <div className="match-replay__loading">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: "#fde82b" }} spin />} />
          <span>{t("pages.replay.loading")}</span>
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <Tabs activeKey={tab} onChange={setTab} items={tabItems} className="match-replay__tabs" />
      ) : null}
    </div>
  );
};

export default translate(MatchReplayPage);
