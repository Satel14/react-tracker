import React from "react";

// The stage reads pan/zoom from pointer events on its own wrapper, so any
// overlay pixel that swallows a pointer silently freezes dragging in that
// corner of the map. Kept inline so a stylesheet refactor cannot drop it.
const PASSTHROUGH = { pointerEvents: "none" };

const clampHealth = (row) => {
  if (!row.alive) return 0;
  const h = Number(row.h);
  if (!Number.isFinite(h)) return 100;
  return Math.max(0, Math.min(100, h));
};

const stateOf = (row) => (!row.alive ? "dead" : row.knocked ? "knocked" : "alive");

const STATE_KEY = {
  alive: "pages.replay.stateAlive",
  knocked: "pages.replay.stateKnocked",
  dead: "pages.replay.stateDead",
};

// Last entry whose t has already passed; 0 before the first one. The array is
// at most ~9 long, so a scan is both correct and cheaper to read than a search.
export const phaseAt = (phases, displayT) => {
  const at = Number.isFinite(displayT) ? displayT : 0;
  let phase = 0;
  for (const entry of phases || []) {
    if (entry && entry.t <= at) phase = entry.p;
    else break;
  }
  return phase;
};

export const formatElapsed = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const ReplayOverlays = ({ rows = [], phases = [], t, displayT = 0, focalTeamId = null }) => {
  const list = rows || [];
  const alive = list.filter((row) => row && row.alive);
  const teamsAlive = new Set(alive.map((row) => row.teamId ?? "none")).size;
  const members = focalTeamId == null ? [] : list.filter((row) => row && row.teamId === focalTeamId);

  return (
    <div className="replay-overlay" style={PASSTHROUGH}>
      <div className="replay-overlay__alive" style={PASSTHROUGH}>
        <span className="replay-overlay__alive-players">
          {t("pages.replay.aliveCount", { count: alive.length })}
        </span>
        <span className="replay-overlay__alive-teams">
          {t("pages.replay.teamsAlive", { count: teamsAlive })}
        </span>
      </div>

      <div className="replay-overlay__clock" style={PASSTHROUGH}>
        <span className="replay-overlay__time">{formatElapsed(displayT)}</span>
        <span className="replay-overlay__phase">
          {t("pages.replay.phase", { phase: phaseAt(phases, displayT) })}
        </span>
      </div>

      {members.length > 0 && (
        <div className="replay-overlay__team" style={PASSTHROUGH}>
          <div className="replay-overlay__team-title">{t("pages.replay.yourTeam")}</div>
          {members.map((row, i) => {
            const state = stateOf(row);
            return (
              <div
                key={row.accountId || `${row.name}-${i}`}
                className={`replay-overlay__member is-${state}`}
              >
                <span className="replay-overlay__member-name">{row.name}</span>
                <span className="replay-overlay__health">
                  <span
                    className="replay-overlay__health-fill"
                    style={{ width: `${clampHealth(row)}%` }}
                  />
                </span>
                <span className="replay-overlay__state">{t(STATE_KEY[state])}</span>
                <span className="replay-overlay__kills">
                  {t("pages.replay.killsShort", { count: row.kills || 0 })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReplayOverlays;
