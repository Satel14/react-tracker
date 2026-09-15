import React from "react";
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

// The list arrives already filtered, and `emptyLabel` says why it can be empty.
// Both used to be this component's own business; KillsPane took them over so
// the map beside the feed narrows with it.
const KillFeed = ({ kills = [], platform, t, highlightId = null, onHighlight, emptyLabel }) => {
  if (!kills.length) {
    return <EmptyState className="kill-feed__empty">{emptyLabel || t("pages.match.noKills")}</EmptyState>;
  }

  // onFocus/onBlur alongside the mouse pair: React's focus events bubble, so a
  // keyboard user tabbing onto either profile link in the row lights the same
  // tracer the mouse would.
  const point = (id) => () => onHighlight?.(id ?? null);

  return (
    <div className="kill-feed">
      <ul className="kill-feed__list">
        {kills.map((k, i) => (
          <li
            key={k.id ?? `${k.t}-${i}`}
            className={`kill-feed__row${k.isFocalKill ? " is-kill" : ""}${k.isFocalDeath ? " is-death" : ""}${k.id != null && k.id === highlightId ? " is-highlight" : ""}`}
            onMouseEnter={point(k.id)}
            onMouseLeave={point(null)}
            onFocus={point(k.id)}
            onBlur={point(null)}
          >
            <span className="kill-feed__time">{fmt(k.t)}</span>
            <Who className="kill-feed__killer" name={k.killerName} accountId={k.killerAccountId} platform={platform} />
            <span className="kill-feed__arrow">›</span>
            <Who className="kill-feed__victim" name={k.victimName} accountId={k.victimAccountId} platform={platform} />
            <span className="kill-feed__weapon">{t("pages.match.killWith", { weapon: k.weapon })}</span>
            {k.distance != null ? (
              <span className="kill-feed__distance">{t("pages.match.killDistance", { distance: k.distance })}</span>
            ) : null}
            {/* Where the victim fell. Absent on roughly half of real kills --
                a fight in the open between POIs has no name, and the row
                simply carries none. */}
            {k.victimPoi ? <span className="kill-feed__poi">{k.victimPoi}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default KillFeed;
