import React, { useMemo, useState } from "react";
import { Segmented } from "antd";

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const KillFeed = ({ kills = [], t }) => {
  const [filter, setFilter] = useState("all");
  const rows = useMemo(
    () => (filter === "focal" ? kills.filter((k) => k.isFocalKill || k.isFocalDeath) : kills),
    [kills, filter]
  );

  if (!kills.length) return <div className="kill-feed__empty">{t("pages.match.noKills")}</div>;

  return (
    <div className="kill-feed">
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("pages.match.filterAll") },
          { value: "focal", label: t("pages.match.filterFocal") },
        ]}
      />
      <ul className="kill-feed__list">
        {rows.map((k, i) => (
          <li
            key={`${k.t}-${i}`}
            className={`kill-feed__row${k.isFocalKill ? " is-kill" : ""}${k.isFocalDeath ? " is-death" : ""}`}
          >
            <span className="kill-feed__time">{fmt(k.t)}</span>
            <span className="kill-feed__killer">{k.killerName || "—"}</span>
            <span className="kill-feed__arrow">›</span>
            <span className="kill-feed__victim">{k.victimName || "—"}</span>
            <span className="kill-feed__weapon">{t("pages.match.killWith", { weapon: k.weapon })}</span>
            {k.distance != null ? (
              <span className="kill-feed__distance">{t("pages.match.killDistance", { distance: k.distance })}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default KillFeed;
