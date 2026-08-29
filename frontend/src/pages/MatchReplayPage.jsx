import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
import ReplayOverlays from "../component/charts/ReplayOverlays";
import { LAYER_KEYS, readLayerPrefs, writeLayerPrefs } from "../helpers/replayPrefs";

const SPEEDS = [1, 2, 4, 8, 16];
// Eleven things can be on the canvas at once and none of them is
// self-explanatory. The swatch classes are styled to match what the canvas
// paints, so the legend is the one place a viewer can learn the encoding.
const LEGEND = [
  { key: "legendFocal", cls: "is-focal" },
  { key: "legendEnemy", cls: "is-enemy" },
  { key: "legendKnocked", cls: "is-knocked" },
  { key: "legendDead", cls: "is-dead" },
  { key: "legendShot", cls: "is-shot" },
  { key: "legendKill", cls: "is-kill" },
  { key: "legendCrate", cls: "is-crate" },
  { key: "legendFlight", cls: "is-flight" },
  { key: "legendHazard", cls: "is-hazard" },
];

const LAYER_LABEL = {
  shots: "layerShots", landings: "layerLandings", flight: "layerFlight",
  packages: "layerPackages", specialZones: "layerZones", healthArcs: "layerHealth",
};
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
  // react-switch-lang's translate HOC builds a fresh `t` on every render and
  // re-renders whenever anything above it does (its index.js:150). Listing it
  // as an effect dependency therefore re-runs that effect constantly; held in
  // a ref, the error strings stay current without dragging the fetch with them.
  const tRef = useRef(t);
  tRef.current = t;
  const [focusedAccountId, setFocusedAccountId] = useState(null);
  const [tab, setTab] = useState("replay");
  const [analysis, setAnalysis] = useState({ loading: false, error: null, data: null });
  const [wantAnalysis, setWantAnalysis] = useState(false);
  const stageRef = useRef(null);
  const [follow, setFollow] = useState(true);
  // The stage reads these every frame out of its own ref; this copy only drives
  // the checkboxes, so a toggle costs one render of the control bar, not of the
  // animation.
  const [layers, setLayers] = useState(readLayerPrefs);
  // Persist outside the updater: React may call an updater twice (StrictMode,
  // and any re-render it decides to discard), and a storage write is a side
  // effect that must happen once.
  const toggleLayer = (key) => {
    const next = { ...layers, [key]: !layers[key] };
    setLayers(next);
    writeLayerPrefs(next);
  };
  // duration is wall-clock seconds from the match record; endTime is the
  // in-game span, 5-19 s shorter on every real match because the two clocks
  // drift. A legacy payload carries no endTime, so duration still backs it.
  const span = data?.endTime || data?.duration || 0;
  const clock = useReplayClock(span);
  const { toggle } = clock;
  // Whole seconds, not the raw 10 Hz publish tick: health and the knocked flag
  // come from 10 s telemetry samples and deaths land on whole seconds, so a
  // finer key recomputes the roster and re-renders ~100 team-card buttons
  // nine times out of ten for an identical result.
  const rosterT = Math.floor(clock.displayT);
  const roster = useMemo(
    () => (data ? rosterAt(data.players, data.kills, rosterT) : []),
    [data, rosterT]
  );

  // One keyboard owner for the whole replay, on window. The stage used to hold
  // half the bindings on its own div, so they only worked once the user had
  // clicked the map -- while the hint advertising them is printed page-wide --
  // and stopped again the moment focus moved to a control or into fullscreen.
  useEffect(() => {
    if (tab !== "replay") return undefined;
    const onKey = (e) => {
      const el = e.target;
      const tag = el && el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;
      // Leave browser and OS chords alone: Alt+Left is Back, Ctrl+R reloads.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const core = clock.clockRef.current;
      if (!core) return;
      // core.seek always pauses, which a scrubber drag wants and a nudge does not.
      const seekBy = (d) => {
        const wasPlaying = core.playing;
        core.seek(core.t + d);
        if (wasPlaying) core.play();
        clock.publish();
      };
      const step = e.shiftKey ? 30 : 5;
      switch (e.code) {
        case "Space":
          // A focused control owns its own Space.
          if (el && typeof el.closest === "function" && el.closest("button, [role='button'], .ant-slider")) return;
          e.preventDefault();
          toggle();
          return;
        case "ArrowRight": e.preventDefault(); seekBy(step); return;
        case "ArrowLeft": e.preventDefault(); seekBy(-step); return;
        // One telemetry tick: positions arrive every 10 s, so a smaller step
        // just re-renders the same interpolated frame.
        case "Period": seekBy(10); return;
        case "Comma": seekBy(-10); return;
        case "KeyF": stageRef.current?.toggleFullscreen(); return;
        case "KeyR": stageRef.current?.resetView(); return;
        default: {
          // e.code, not e.key: on the Ukrainian layout this app is translated
          // into, e.key for F is "ф" and for R is "к".
          const digit = /^(Digit|Numpad)([0-4])$/.exec(e.code);
          if (digit) clock.setSpeed(SPEEDS[Number(digit[2])]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, toggle, clock]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    getMatchReplay(matchId, platform, accountId, playerName)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data ? decodeReplay(res.data) : null;
        if (payload && Array.isArray(payload.players)) {
          dispatch({ type: "ok", data: payload });
          // You arrive here from your own profile, so start on yourself rather
          // than making the viewer hunt for their dot among sixty. Only on
          // load: after that, null means "the viewer deselected".
          setFocusedAccountId(payload.focalAccountId ?? null);
        }
        else dispatch({ type: "err", error: res?.message || tRef.current("pages.replay.errorUnavailable") });
      })
      .catch((e) => {
        if (!cancelled) dispatch({ type: "err", error: e?.message || tRef.current("pages.replay.errorGeneric") });
      });
    return () => { cancelled = true; };
  }, [matchId, platform, accountId, playerName]);

  // Mark analysis as wanted the first time a non-replay tab is opened.
  useEffect(() => {
    if (tab !== "replay") setWantAnalysis(true);
  }, [tab]);

  // Reset when the match/focal identity changes; re-arm analysis if a
  // non-replay tab is already active so the new match re-fetches.
  useEffect(() => {
    setWantAnalysis(tab !== "replay");
    setAnalysis({ loading: false, error: null, data: null });
    // The clock and the selection outlive a client-side navigation, so without
    // this a new match opens at the previous one's playhead with a player from
    // the previous lobby still highlighted.
    setFocusedAccountId(null);
    clock.clockRef.current?.seek(0);
    clock.publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            ref={stageRef}
            data={data}
            clockRef={clock.clockRef}
            publish={clock.publish}
            focusedAccountId={focusedAccountId}
            onSelect={setFocusedAccountId}
            mapLabel={data.mapName}
            layers={layers}
            follow={follow}
            fullscreenLabel={t("pages.replay.fullscreen")}
            exitFullscreenLabel={t("pages.replay.exitFullscreen")}
          >
            <ReplayOverlays
              rows={roster}
              phases={data.phases}
              t={t}
              displayT={clock.displayT}
              focalTeamId={data.focalTeamId ?? null}
            />
          </ReplayStage>
          <p className="match-replay__hint">{t("pages.replay.hint")}</p>
          <p className="match-replay__shortcuts">{t("pages.replay.shortcuts")}</p>
        </div>
      </div>
      <div className="match-replay__controls">
        <Button onClick={clock.toggle}>
          {clock.playing ? t("pages.replay.pause") : t("pages.replay.play")}
        </Button>
        <Slider
          className="match-replay__scrubber"
          style={{ flex: 1, minWidth: 180 }}
          min={0}
          max={span}
          value={Math.floor(clock.displayT)}
          onChange={clock.seek}
          tooltip={{ formatter: (v) => fmt(v) }}
        />
        <span className="match-replay__time">{fmt(clock.displayT)} / {fmt(span)}</span>
        <span className="match-replay__speed-label">{t("pages.replay.speed")}</span>
        <Segmented
          value={clock.speed}
          onChange={clock.setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />
        {/* Both this and the R shortcut re-fit the camera and nothing else.
            It used to remount the stage, which also threw away the loaded
            high-res raster and the sprite atlas -- a visible blink for an
            action labelled the same as a shortcut that did neither. */}
        <Button
          onClick={() => setFollow((on) => !on)}
          type={follow ? "primary" : "default"}
          aria-pressed={follow}
          title={t("pages.replay.followHint")}
        >
          {t("pages.replay.follow")}
        </Button>
        <Button onClick={() => stageRef.current?.resetView()}>{t("pages.replay.resetView")}</Button>
      </div>
      <div className="match-replay__layers">
        <span className="match-replay__layers-title">{t("pages.replay.layers")}</span>
        {LAYER_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`match-replay__layer${layers[key] ? " is-on" : ""}`}
            aria-pressed={!!layers[key]}
            onClick={() => toggleLayer(key)}
          >
            {t(`pages.replay.${LAYER_LABEL[key]}`)}
          </button>
        ))}
      </div>
      <div className="match-replay__legend">
        <span className="match-replay__legend-title">{t("pages.replay.legend")}</span>
        {LEGEND.map((item) => (
          <span key={item.key} className="match-replay__legend-item">
            <span className={`match-replay__swatch ${item.cls}`} aria-hidden="true" />
            {t(`pages.replay.${item.key}`)}
          </span>
        ))}
      </div>
      <ReplayRoster
        rows={roster}
        focusedAccountId={focusedAccountId}
        onSelect={setFocusedAccountId}
        t={t}
      />
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
      {loading && !data ? (
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
