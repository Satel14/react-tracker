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

const DamageBreakdown = ({ damage, meds, focalPresent, t }) => {
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
    </div>
  );
};

export default DamageBreakdown;
