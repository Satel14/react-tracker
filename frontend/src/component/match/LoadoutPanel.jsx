import React from "react";
import EmptyState from "../EmptyState";

// An attachment shows its name when we have one, and its slot when we do not.
// Only sights are named: magnification is the one attachment identity that
// changes how a loadout reads, and inventing names for the other 32 measured
// ids is the guessing this project keeps refusing.
const attachLabel = (a, t) => a.name || t(`pages.match.attachSlot${a.slot}`);

const LoadoutPanel = ({ loadout, focalPresent, t }) => {
  if (!focalPresent || !loadout) {
    return <EmptyState className="loadout__empty">{t("pages.match.focalNotInMatch")}</EmptyState>;
  }
  const { cutoff, weapons = [], armour = [], lootedFrom = [] } = loadout;
  if (!weapons.length && !armour.length) {
    return <EmptyState className="loadout__empty">{t("pages.match.loadoutEmpty")}</EmptyState>;
  }

  return (
    <div className="loadout">
      <div className="loadout__cutoff">
        {t(cutoff === "death" ? "pages.match.loadoutAtDeath" : "pages.match.loadoutAtEnd")}
      </div>

      <div className="loadout__weapons">
        {weapons.map((w) => (
          <div key={w.key} className="loadout__weapon">
            <span className="loadout__weapon-name">{w.name || w.key}</span>
            <span className="loadout__attachments">
              {w.attachments.map((a) => (
                <span key={a.slot} className="loadout__attach">{attachLabel(a, t)}</span>
              ))}
            </span>
          </div>
        ))}
      </div>

      {armour.length ? (
        <div className="loadout__armour">
          {armour.map((a) => (
            <span key={a.key} className="loadout__armour-item">
              <span className="loadout__armour-slot">{t(`pages.match.armour${a.slot}`)}</span>
              {/* No level for an id that carries none -- Item_Back_BlueBlocker
                  ships without a Lv token, and inventing one would be wrong. */}
              {a.level != null ? (
                <span className="loadout__armour-level">{t("pages.match.armourLevel", { level: a.level })}</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {lootedFrom.length ? (
        <div className="loadout__looted">
          {t("pages.match.lootedFrom")}{" "}
          {lootedFrom.map((p) => `${p.name} (${p.items})`).join(", ")}
        </div>
      ) : null}

      <div className="loadout__counts">
        {t("pages.match.loadoutCounts", {
          picked: loadout.picked,
          dropped: loadout.dropped,
          crate: loadout.fromCarePackage,
        })}
      </div>
    </div>
  );
};

export default LoadoutPanel;
