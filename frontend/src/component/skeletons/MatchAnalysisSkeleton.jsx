import React from "react";
import { SkeletonFrame, SkeletonTile as Tile } from "../Skeleton";

const Cells = ({ count }) =>
  Array.from({ length: count }, (_, index) => <Tile key={index} variant="cell" />);

const KillsSkeleton = ({ label, rows }) => (
  <SkeletonFrame label={label}>
    <div className="kill-map">
      <div className="map-stage kill-map__stage">
        <span className="skeleton map-stage__bg" aria-hidden="true" />
      </div>
    </div>
    <div className="kill-feed">
      <ul className="kill-feed__list">
        {Array.from({ length: rows }, (_, index) => (
          <li className="kill-feed__row" key={index}>
            <Tile variant="label" />
            <Tile variant="cell" />
            <Tile variant="chip" />
          </li>
        ))}
      </ul>
    </div>
  </SkeletonFrame>
);

// Five rows per column because DamageBreakdown draws one per body region.
const DAMAGE_REGIONS = 5;

const DamageSkeleton = ({ label }) => (
  <SkeletonFrame className="damage" label={label}>
    <div className="damage__headshot"><Tile variant="label" /></div>
    <div className="damage__cols">
      {Array.from({ length: 2 }, (_, col) => (
        <div className="damage__col" key={col}>
          <div className="damage__col-head">
            <Tile variant="label" />
            <Tile variant="heading" />
          </div>
          {Array.from({ length: DAMAGE_REGIONS }, (_, region) => (
            <div className="damage__region" key={region}>
              <Tile variant="cell" />
              <Tile variant="cell" />
              <Tile variant="cell" />
            </div>
          ))}
        </div>
      ))}
    </div>
  </SkeletonFrame>
);

const TimelineSkeleton = ({ label, rows }) => (
  <SkeletonFrame className="timeline" label={label}>
    <div className="timeline__accuracy">
      <div className="timeline__accuracy-head"><Tile variant="label" /></div>
      <div className="timeline__acc-row timeline__acc-row--head"><Cells count={4} /></div>
      {Array.from({ length: 4 }, (_, index) => (
        <div className="timeline__acc-row" key={index}><Cells count={4} /></div>
      ))}
    </div>
    <ul className="timeline__events">
      {Array.from({ length: rows }, (_, index) => (
        <li className="timeline__event" key={index}><Cells count={4} /></li>
      ))}
    </ul>
  </SkeletonFrame>
);

// Two weapon rows because that is what the game lets a player carry, and the
// panel draws one per weapon.
const LoadoutSkeleton = ({ label }) => (
  <SkeletonFrame className="loadout" label={label}>
    <div className="loadout__cutoff"><Tile variant="label" /></div>
    <div className="loadout__weapons">
      {Array.from({ length: 2 }, (_, row) => (
        <div className="loadout__weapon" key={row}>
          <Tile variant="label" />
          <span className="loadout__attachments">
            <Tile variant="chip" />
            <Tile variant="chip" />
            <Tile variant="chip" />
          </span>
        </div>
      ))}
    </div>
    <div className="loadout__armour">
      <Cells count={3} />
    </div>
    <div className="loadout__counts"><Tile variant="label" /></div>
  </SkeletonFrame>
);

// One shape per analysis tab rather than one shared stack: the tabs differ by a
// square map and a seven-column table, so a single placeholder could only ever
// match one of them.
const MatchAnalysisSkeleton = ({ label, tab = "kills", rows = 8 }) => {
  if (tab === "damage") return <DamageSkeleton label={label} />;
  if (tab === "timeline") return <TimelineSkeleton label={label} rows={rows} />;
  if (tab === "loadout") return <LoadoutSkeleton label={label} />;
  return <KillsSkeleton label={label} rows={rows} />;
};

export default MatchAnalysisSkeleton;
