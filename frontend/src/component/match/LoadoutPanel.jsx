import React from "react";
import EmptyState from "../EmptyState";

// An attachment shows its name when we have one, and its slot when we do not.
// Only sights are named: magnification is the one attachment identity that
// changes how a loadout reads, and inventing names for the other 32 measured
// ids is the guessing this project keeps refusing.
const attachLabel = (a, t) => a.name || t(`pages.match.attachSlot${a.slot}`);

const COUNTERS = [
  { key: "countPicked", field: "picked" },
  { key: "countDropped", field: "dropped" },
  { key: "countCrate", field: "fromCarePackage" },
];

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

      {/* Two columns: what was carried, and where it came from. The four cards
          used to stack at the full width of the column and the whole tab
          measured 295px inside a 1327px page. */}
      <div className="loadout__grid">
        <div className="loadout__col">
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
        </div>

        <div className="loadout__col">
          {lootedFrom.length ? (
            <div className="loadout__looted">
              {t("pages.match.lootedFrom")}{" "}
              {lootedFrom.map((p) => `${p.name} (${p.items})`).join(", ")}
            </div>
          ) : null}

          {/* Three figures rather than one sentence. They are three separate
              facts, and a zero among them is a reading -- nothing out of a
              care package -- so the set always shows all three. */}
          <div className="loadout__counts">
            {COUNTERS.map(({ key, field }) => (
              <div key={key} className="loadout__count">
                <span className="loadout__count-val">{loadout[field] ?? 0}</span>
                <span className="loadout__count-label">{t(`pages.match.${key}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadoutPanel;
