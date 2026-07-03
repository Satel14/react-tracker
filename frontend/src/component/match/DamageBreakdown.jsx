import React from "react";

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

const DamageBreakdown = ({ damage, focalPresent, t }) => {
  if (!focalPresent || !damage) {
    return <div className="damage__empty">{t("pages.match.focalNotInMatch")}</div>;
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
    </div>
  );
};

export default DamageBreakdown;
