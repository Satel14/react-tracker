import React from "react";
import { groupRosterIntoTeams } from "./replayEngine";

// Health is a step-held telemetry reading, so it can be absent on a legacy
// payload: treat that as unhurt rather than as a zero-width bar.
const clampHealth = (h) => {
  const value = typeof h === "number" && Number.isFinite(h) ? h : 100;
  return Math.max(0, Math.min(100, Math.round(value)));
};

// Knocked and dead must be told apart without relying on colour, so each row
// carries a distinct state word plus a decorative glyph.
const STATE = {
  alive: { key: "pages.replay.stateAlive", mark: "", cls: "" },
  knocked: { key: "pages.replay.stateKnocked", mark: "!", cls: "is-knocked" },
  dead: { key: "pages.replay.stateDead", mark: "✕", cls: "is-dead" },
};

const ReplayRoster = ({ rows = [], focusedAccountId = null, onSelect, t }) => {
  const teams = groupRosterIntoTeams(rows);

  return (
    <div className="replay-roster">
      <div className="replay-roster__title">{t("pages.replay.roster")}</div>
      <div className="replay-roster__teams">
        {teams.map((team) => (
          <section
            key={team.key}
            className={[
              "replay-roster__team",
              team.isFocal ? "is-focal" : "",
              team.aliveCount === 0 ? "is-wiped" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <header className="replay-roster__team-head">
              <span className="replay-roster__team-name">
                {team.isFocal
                  ? t("pages.replay.yourTeam")
                  : team.teamId == null
                    ? t("pages.replay.teamless")
                    : t("pages.replay.teamLabel", { id: team.teamId })}
              </span>
              {/* role="img" because aria-label on a bare span is ignored: without
                  a role there is nothing for the name to attach to. */}
              <span
                className="replay-roster__team-alive"
                role="img"
                aria-label={t("pages.replay.aliveOf", { alive: team.aliveCount, total: team.total })}
              >
                {`${team.aliveCount}/${team.total}`}
              </span>
            </header>
            <div className="replay-roster__members">
              {team.members.map((row) => {
                const selected = row.accountId === focusedAccountId;
                const knocked = row.alive && !!row.knocked;
                const state = row.alive ? (knocked ? STATE.knocked : STATE.alive) : STATE.dead;
                const health = clampHealth(row.h);
                const cls = [
                  "replay-roster__row",
                  state.cls,
                  selected ? "is-selected" : "",
                  row.isFocal ? "is-focal" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    type="button"
                    key={row.accountId}
                    className={cls}
                    data-account={row.accountId}
                    aria-pressed={selected}
                    onClick={() => onSelect(selected ? null : row.accountId)}
                  >
                    <span className="replay-roster__name">{row.name}</span>
                    <span className="replay-roster__kills">
                      {t("pages.replay.killsShort", { count: row.kills })}
                    </span>
                    <span
                      className="replay-roster__health"
                      role="img"
                      aria-label={t("pages.replay.healthLabel", { value: health })}
                    >
                      <span className="replay-roster__health-fill" style={{ width: `${health}%` }} />
                    </span>
                    {state.mark ? (
                      <span className="replay-roster__state-mark" aria-hidden="true">
                        {state.mark}
                      </span>
                    ) : null}
                    <span className="replay-roster__state">{t(state.key)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default ReplayRoster;
