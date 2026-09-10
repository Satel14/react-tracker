import React from "react";
import EmptyState from "../EmptyState";

const REGIONS = ["HeadShot", "TorsoShot", "ArmShot", "LegShot", "PelvisShot"];

const RegionBars = ({ bucket, title, t }) => {
  const max = Math.max(1, ...REGIONS.map((r) => bucket[r] || 0));
  return (
    <div className="damage__col">
      <div className="damage__col-head">
        <span>{title}</span>
        <strong>{bucket.total}</strong>
      </div>
      {REGIONS.map((r) => (
        <div key={r} className="damage__region">
          <span className="damage__region-label">{t(`pages.match.region${r}`)}</span>
          <span className="damage__region-track">
            <span className="damage__region-fill" style={{ width: `${((bucket[r] || 0) / max) * 100}%` }} />
          </span>
          <span className="damage__region-val">{bucket[r] || 0}</span>
        </div>
      ))}
    </div>
  );
};

// "Lv2 x2 . Lv3 x1" from the tallied levels. A level-less armour id prints its
// count alone -- Item_Back_BlueBlocker really has no level.
const armourTally = (rows, t) =>
  rows
    .map((r) => (r.level == null ? `×${r.count}` : `${t("pages.match.armourLevel", { level: r.level })} ×${r.count}`))
    .join(" · ");

const envTotal = (e) =>
  (e.armourBroke?.length || 0) + (e.armourLost?.length || 0) +
  e.vehicleDamage + e.windows + e.fences + e.vaults + e.doorsOpened + e.vending;

const DamageBreakdown = ({ damage, meds, throws, environment, focalPresent, t }) => {
  if (!focalPresent || !damage) {
    return <EmptyState className="damage__empty">{t("pages.match.focalNotInMatch")}</EmptyState>;
  }
  return (
    <div className="damage">
      <div className="damage__headshot">{t("pages.match.headshotPct", { pct: damage.headshotDamagePct })}</div>
      <div className="damage__cols">
        <RegionBars bucket={damage.dealt} title={t("pages.match.damageDealt")} t={t} />
        <RegionBars bucket={damage.taken} title={t("pages.match.damageTaken")} t={t} />
      </div>
      {damage.dealtByWeapon?.length ? (
        <div className="damage__weapons">
          <div className="damage__weapons-head">{t("pages.match.byWeapon")}</div>
          {damage.dealtByWeapon.map((w) => (
            <div key={w.weaponKey || w.weapon} className="damage__weapon">
              <span>{w.weapon}</span>
              <span>{w.damage}</span>
            </div>
          ))}
        </div>
      ) : null}
      {throws?.totalThrown ? (
        <div className="damage__throws">
          <div className="damage__throws-head">{t("pages.match.throwables")}</div>
          {throws.used.map((item) => (
            <div key={item.key || item.name} className="damage__throw">
              <span className="damage__throw-name">{item.name}</span>
              <span className="damage__throw-count">{t("pages.match.medCount", { count: item.count })}</span>
              {/* Smoke and flash deal none by design, so a "+0" beside one would
                  read as a miss. A molotov keeps its zero: it can deal damage
                  and did not, which is the fact worth reading. */}
              {item.damaging ? (
                <span className="damage__throw-dmg">{t("pages.match.throwDamage", { damage: item.damage })}</span>
              ) : null}
            </div>
          ))}
          {throws.totalDamage > 0 ? (
            <div className="damage__throw-share">
              {t("pages.match.throwShare", { damage: throws.totalDamage, total: damage.dealt.total })}
            </div>
          ) : null}
        </div>
      ) : null}
      {environment && envTotal(environment) > 0 ? (
        <div className="damage__broke">
          {environment.armourBroke.length || environment.armourLost.length ? (
            <>
              <div className="damage__broke-head">{t("pages.match.brokeArmour")}</div>
              {environment.armourBroke.length ? (
                <div className="damage__broke-row damage__broke-armour-broke">
                  <span>{t("pages.match.brokeArmourEnemy")}</span>
                  <span className="damage__broke-val">{armourTally(environment.armourBroke, t)}</span>
                </div>
              ) : null}
              {environment.armourLost.length ? (
                <div className="damage__broke-row damage__broke-armour-lost">
                  <span>{t("pages.match.brokeArmourOwn")}</span>
                  <span className="damage__broke-val">{armourTally(environment.armourLost, t)}</span>
                </div>
              ) : null}
            </>
          ) : null}

          {environment.vehicleDamage || environment.windows || environment.fences ? (
            <>
              <div className="damage__broke-head">{t("pages.match.brokeThings")}</div>
              {environment.vehicleDamage ? (
                /* Labelled, not bare: a car has far more health than a player,
                   so 864 must not read as catastrophic. */
                <div
                  className="damage__broke-row damage__broke-vehicles"
                  title={t("pages.match.brokeVehiclesHint")}
                >
                  <span>{t("pages.match.brokeVehicles")}</span>
                  <span className="damage__broke-val">{environment.vehicleDamage}</span>
                </div>
              ) : null}
              {environment.windows ? (
                <div className="damage__broke-row damage__broke-windows">
                  <span>{t("pages.match.brokeWindows")}</span>
                  <span className="damage__broke-val">{environment.windows}</span>
                </div>
              ) : null}
              {environment.fences ? (
                <div className="damage__broke-row damage__broke-fences">
                  <span>{t("pages.match.brokeFences")}</span>
                  <span className="damage__broke-val">{environment.fences}</span>
                </div>
              ) : null}
            </>
          ) : null}

          {environment.vaults || environment.doorsOpened || environment.vending ? (
            <div className="damage__broke-moves">
              {t("pages.match.brokeMoves", {
                vaults: environment.vaults,
                doors: environment.doorsOpened,
                vending: environment.vending,
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {meds?.totalUses ? (
        <div className="damage__meds">
          <div className="damage__meds-head">{t("pages.match.consumables")}</div>
          {meds.used.map((item) => (
            <div key={item.key} className="damage__med">
              <span className="damage__med-name">{item.name}</span>
              <span className="damage__med-count">{t("pages.match.medCount", { count: item.count })}</span>
              {/* Absent, not zero: a boost restores no HP itself, and a "+0 HP"
                  beside an energy drink reads as a wasted use. */}
              {item.hp != null ? (
                <span className="damage__med-hp">{t("pages.match.medHp", { hp: item.hp })}</span>
              ) : null}
            </div>
          ))}
          {meds.boostHp > 0 ? (
            <div className="damage__med damage__med-regen">
              <span className="damage__med-name">{t("pages.match.boostRegen")}</span>
              <span className="damage__med-hp">{t("pages.match.medHp", { hp: meds.boostHp })}</span>
            </div>
          ) : null}
          {meds.other?.length ? (
            <div className="damage__med-other">
              {t("pages.match.medOther")}{" "}
              {meds.other.map((o) => `${o.name} ×${o.count}`).join(", ")}
            </div>
          ) : null}
          <div className="damage__med-context">
            <span>{t("pages.match.medInZone", { n: meds.inBlueZone, of: meds.totalUses })}</span>
            <span>{t("pages.match.medInVehicle", { n: meds.inVehicle, of: meds.totalUses })}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DamageBreakdown;
