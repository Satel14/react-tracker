import React, { useMemo, useState } from "react";
import { Segmented } from "antd";
import { formatClock as fmt } from "../../helpers/formatClock";
import EmptyState from "../EmptyState";

const CombatTimeline = ({ timeline, focalPresent, t }) => {
  const [side, setSide] = useState("all");
  const { events = [], accuracy = [], thirdParties = [] } = timeline || {};

  // Which way the damage went is carried only by a 3px bar down the left edge
  // of the row, so a player reading "what did I take" has to scan for a colour.
  const rows = useMemo(
    () => (side === "all" ? events : events.filter((e) => e.kind === side)),
    [events, side]
  );

  if (!focalPresent || !timeline) {
    return <EmptyState className="timeline__empty">{t("pages.match.focalNotInMatch")}</EmptyState>;
  }

  return (
    <div className="timeline">
      {/* Above the grid rather than in a column: it is a warning about the
          match, not a reading of one half of it. */}
      {thirdParties.length ? (
        <div className="timeline__third">
          {thirdParties.map((tp) => (
            <span key={tp.t} className="timeline__third-tag">
              {t("pages.match.thirdParty")} · {fmt(tp.t)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="timeline__grid">
        <div className="timeline__accuracy">
          <div className="timeline__accuracy-head">{t("pages.match.accuracy")}</div>
          <div className="timeline__acc-row timeline__acc-row--head">
            <span>{t("pages.match.weapon")}</span>
            <span>{t("pages.match.shots")}</span>
            <span>{t("pages.match.hits")}</span>
            <span>%</span>
          </div>
          {accuracy.map((a) => (
            <div key={a.weapon} className="timeline__acc-row">
              <span>{a.weapon}</span>
              <span>{a.shots}</span>
              <span>{a.hits}</span>
              <span>{a.pct}%</span>
            </div>
          ))}
        </div>

        <div className="timeline__log">
          <Segmented
            value={side}
            onChange={setSide}
            options={[
              { value: "all", label: t("pages.match.filterAll") },
              { value: "dealt", label: t("pages.match.filterDealt") },
              { value: "taken", label: t("pages.match.filterTaken") },
            ]}
          />
          {rows.length ? (
            <div className="timeline__events">
              {/* The accuracy table beside this one is headed, so four bare
                  columns here read as more of its rows. */}
              <div className="timeline__event timeline__event--head">
                <span>{t("pages.match.colTime")}</span>
                <span>{t("pages.match.colOpponent")}</span>
                <span>{t("pages.match.weapon")}</span>
                <span>{t("pages.match.colDamage")}</span>
              </div>
              {rows.map((e, i) => (
                <div key={`${e.t}-${i}`} className={`timeline__event is-${e.kind}`}>
                  <span className="timeline__event-time">{fmt(e.t)}</span>
                  <span className="timeline__event-opp">{e.opponent || "—"}</span>
                  <span className="timeline__event-weapon">{e.weapon}</span>
                  <span className="timeline__event-amount">{e.amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState className="timeline__empty">{t("pages.match.noEventsFiltered")}</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
};

export default CombatTimeline;
