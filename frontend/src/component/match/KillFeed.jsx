import React, { useMemo, useState } from "react";
import { Segmented } from "antd";
import { Link } from "react-router-dom";
import { formatClock as fmt } from "../../helpers/formatClock";
import { profilePath } from "../../helpers/profileLink";
import EmptyState from "../EmptyState";

// A name links to its profile only when there is a real account behind it.
// Most of a PUBG lobby is AI and a bot's name reads exactly like a person's,
// so linking on the name alone would be mostly dead links.
const Who = ({ name, accountId, platform, className }) => {
  const label = name || "—";
  const to = name ? profilePath(platform, name, accountId) : null;
  return <span className={className}>{to ? <Link to={to}>{label}</Link> : label}</span>;
};

const KillFeed = ({ kills = [], platform, t }) => {
  const [filter, setFilter] = useState("all");
  const rows = useMemo(
    () => (filter === "focal" ? kills.filter((k) => k.isFocalKill || k.isFocalDeath) : kills),
    [kills, filter]
  );

  if (!kills.length) return <EmptyState className="kill-feed__empty">{t("pages.match.noKills")}</EmptyState>;

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
            <Who className="kill-feed__killer" name={k.killerName} accountId={k.killerAccountId} platform={platform} />
            <span className="kill-feed__arrow">›</span>
            <Who className="kill-feed__victim" name={k.victimName} accountId={k.victimAccountId} platform={platform} />
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
