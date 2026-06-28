import React from "react";

const ReplayRoster = ({ rows = [], focusedAccountId = null, onSelect, t }) => {
  const teams = [];
  const indexByTeam = new Map();
  for (const row of rows) {
    const key = row.teamId ?? "none";
    if (!indexByTeam.has(key)) {
      indexByTeam.set(key, teams.length);
      teams.push({ key, members: [] });
    }
    teams[indexByTeam.get(key)].members.push(row);
  }

  return (
    <div className="replay-roster">
      <div className="replay-roster__title">{t("pages.replay.roster")}</div>
      {teams.map((team) => (
        <div key={team.key} className="replay-roster__team">
          {team.members.map((row) => {
            const selected = row.accountId === focusedAccountId;
            const cls = [
              "replay-roster__row",
              row.alive ? "" : "is-dead",
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
                onClick={() => onSelect(selected ? null : row.accountId)}
              >
                <span className="replay-roster__name">{row.name}</span>
                <span className="replay-roster__kills">{t("pages.replay.killsShort", { count: row.kills })}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default ReplayRoster;
