import React from "react";
import { Link } from "react-router-dom";
import { profilePath } from "../../helpers/profileLink";
import { formatClock as fmtSurvival } from "../../helpers/formatClock";
import EmptyState from "../EmptyState";


const MatchScoreboard = ({ scoreboard, platform, t }) => {
  const teams = scoreboard?.teams || [];
  if (!teams.length) return <EmptyState className="match-scoreboard__empty">{t("pages.match.emptyScoreboard")}</EmptyState>;

  return (
    <div className="match-scoreboard">
      {teams.map((team) => (
        <div
          key={team.teamId ?? team.rank}
          className={`match-scoreboard__team${team.isFocalTeam ? " is-focal" : ""}`}
        >
          <div className="match-scoreboard__team-head">
            <span className="match-scoreboard__rank">
              {t("pages.match.placement", { rank: team.rank ?? "?" })}
            </span>
            {team.won ? <span className="match-scoreboard__won">{t("pages.match.won")}</span> : null}
          </div>
          <div className="match-scoreboard__rows">
            <div className="match-scoreboard__row match-scoreboard__row--head">
              <span>{t("pages.match.colPlayer")}</span>
              <span>{t("pages.match.colKills")}</span>
              <span>{t("pages.match.colDamage")}</span>
              <span>{t("pages.match.colAssists")}</span>
              <span>{t("pages.match.colDbno")}</span>
              <span>{t("pages.match.colHs")}</span>
              <span>{t("pages.match.colSurvival")}</span>
            </div>
            {team.players.map((p) => {
              // The name is not enough on its own: most of a PUBG lobby is AI
              // and a bot's name reads exactly like a person's, so this linked
              // ninety-two dead profiles in a hundred-entrant match.
              // profilePath asks the account id instead, and returns null for
              // anyone who has no profile to open.
              const to = profilePath(platform, p.name, p.accountId);
              return (
              <div
                key={p.accountId || p.name}
                className={`match-scoreboard__row${p.isFocal ? " is-focal" : ""}`}
              >
                <span className="match-scoreboard__name">
                  {to ? <Link to={to}>{p.name}</Link> : p.name}
                </span>
                <span>{p.kills}</span>
                <span>{p.damageDealt}</span>
                <span>{p.assists}</span>
                <span>{p.DBNOs}</span>
                <span>{p.headshotKills}</span>
                <span>{fmtSurvival(p.timeSurvived)}</span>
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MatchScoreboard;
