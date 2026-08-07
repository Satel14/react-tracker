import React from "react";
import { formatClock as fmt } from "../../helpers/formatClock";
import EmptyState from "../EmptyState";

const CombatTimeline = ({ timeline, focalPresent, t }) => {
  if (!focalPresent || !timeline) {
    return <EmptyState className="timeline__empty">{t("pages.match.focalNotInMatch")}</EmptyState>;
  }
  const { events = [], accuracy = [], thirdParties = [] } = timeline;
  return (
    <div className="timeline">
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

      {thirdParties.length ? (
        <div className="timeline__third">
          {thirdParties.map((tp) => (
            <span key={tp.t} className="timeline__third-tag">
              {t("pages.match.thirdParty")} · {fmt(tp.t)}
            </span>
          ))}
        </div>
      ) : null}

      <ul className="timeline__events">
        {events.map((e, i) => (
          <li key={`${e.t}-${i}`} className={`timeline__event is-${e.kind}`}>
            <span className="timeline__event-time">{fmt(e.t)}</span>
            <span className="timeline__event-opp">{e.opponent || "—"}</span>
            <span className="timeline__event-weapon">{e.weapon}</span>
            <span className="timeline__event-amount">{e.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CombatTimeline;
