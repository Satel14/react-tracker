import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Alert, Button, Slider, Segmented, Tabs } from "antd";
import { translate } from "react-switch-lang";
import ReplayStage from "../component/charts/ReplayStage";
import Skeleton from "../component/Skeleton";
import ReplayRoster from "../component/charts/ReplayRoster";
import MatchScoreboard from "../component/match/MatchScoreboard";
import KillFeed from "../component/match/KillFeed";
import KillMap from "../component/match/KillMap";
import DamageBreakdown from "../component/match/DamageBreakdown";
import CombatTimeline from "../component/match/CombatTimeline";
import { getMatchReplay, getMatchAnalysis } from "../api/player";
import { useReplayClock } from "../component/charts/useReplayClock";
import { rosterAt } from "../component/charts/replayEngine";
import { formatClock as fmt } from "../helpers/formatClock";
import { decodeReplay } from "../helpers/replayModel";

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
  const [analysis, setAnalysis] = useState({ loading: false, error: null, data: null });
  const [wantAnalysis, setWantAnalysis] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const clock = useReplayClock(data?.duration || 0);
  const { toggle } = clock;
  const roster = useMemo(
    () => (data ? rosterAt(data.players, data.kills, clock.displayT) : []),
    [data, clock.displayT]
  );

  useEffect(() => {
    if (tab !== "replay") return undefined;
    const onKey = (e) => {
      if (e.code !== "Space") return;
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;
      if (el && typeof el.closest === "function" && el.closest("button, [role='button'], .ant-slider")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, toggle]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    getMatchReplay(matchId, platform, accountId, playerName)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data ? decodeReplay(res.data) : null;
        if (payload && Array.isArray(payload.players)) dispatch({ type: "ok", data: payload });
        else dispatch({ type: "err", error: res?.message || t("pages.replay.errorUnavailable") });
      })
      .catch((e) => {
        if (!cancelled) dispatch({ type: "err", error: e?.message || t("pages.replay.errorGeneric") });
      });
    return () => { cancelled = true; };
  }, [matchId, platform, accountId, playerName, t]);

  // Mark analysis as wanted the first time a non-replay tab is opened.
  useEffect(() => {
    if (tab !== "replay") setWantAnalysis(true);
  }, [tab]);

  // Reset when the match/focal identity changes; re-arm analysis if a
  // non-replay tab is already active so the new match re-fetches.
  useEffect(() => {
    setWantAnalysis(tab !== "replay");
    setAnalysis({ loading: false, error: null, data: null });
  }, [matchId, platform, accountId, playerName]);

  // Fetch analysis once wanted; keyed on match identity, NOT on tab, so
  // switching between analysis tabs never cancels or refetches it.
  useEffect(() => {
    if (!wantAnalysis) return;
    let cancelled = false;
    setAnalysis({ loading: true, error: null, data: null });
    getMatchAnalysis(matchId, platform, accountId, playerName)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || null;
        if (payload && payload.scoreboard) setAnalysis({ loading: false, error: null, data: payload });
        else setAnalysis({ loading: false, error: res?.message || t("pages.match.error"), data: null });
      })
      .catch((e) => {
        if (!cancelled) setAnalysis({ loading: false, error: e?.message || t("pages.match.error"), data: null });
      });
    return () => { cancelled = true; };
  }, [wantAnalysis, matchId, platform, accountId, playerName, t]);

  const renderReplay = () => (
    <>
      <div className="match-replay__layout">
        <div className="match-replay__stage">
          <ReplayStage
            key={resetKey}
            data={data}
            clockRef={clock.clockRef}
            publish={clock.publish}
            focusedAccountId={focusedAccountId}
            onSelect={setFocusedAccountId}
            mapLabel={data.mapName}
          />
          <p className="match-replay__hint">{t("pages.replay.hint")}</p>
        </div>
        <ReplayRoster
          rows={roster}
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
          value={Math.floor(clock.displayT)}
          onChange={clock.seek}
          tooltip={{ formatter: (v) => fmt(v) }}
        />
        <span className="match-replay__time">{fmt(clock.displayT)} / {fmt(data.duration || 0)}</span>
        <span className="match-replay__speed-label">{t("pages.replay.speed")}</span>
        <Segmented
          value={clock.speed}
          onChange={clock.setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />
        <Button onClick={() => setResetKey((n) => n + 1)}>{t("pages.replay.resetView")}</Button>
      </div>
    </>
  );

  const renderAnalysisPane = (child) => {
    if (analysis.loading) {
      return <Skeleton variant="text" count={6} label={t("pages.match.loading")} />;
    }
    if (analysis.error) return <Alert type="error" message={analysis.error} showIcon />;
    if (!analysis.data) return null;
    return child(analysis.data);
  };

  const tabItems = data
    ? [
        { key: "replay", label: t("pages.match.tabReplay"), children: tab === "replay" ? renderReplay() : null },
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
        <Skeleton variant="block" label={t("pages.replay.loading")} className="match-replay__loading" />
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : data ? (
        <Tabs activeKey={tab} onChange={setTab} items={tabItems} className="match-replay__tabs" />
      ) : null}
    </div>
  );
};

export default translate(MatchReplayPage);
