import React from "react";
import { SkeletonFrame, SkeletonTile as Tile } from "../Skeleton";

// Reuses .replay-stage rather than a box of its own: the stage's 16:9 comes
// from a padding spacer on ::before, so the class is the geometry. Same reason
// the roster placeholder sits in the real auto-fill grid.
const ReplayPaneSkeleton = ({ label, teams = 8 }) => (
  <SkeletonFrame label={label}>
    <div className="match-replay__layout">
      <div className="match-replay__stage">
        <div className="replay-stage">
          <span className="skeleton replay-stage__layer" aria-hidden="true" />
        </div>
        <p className="match-replay__hint"><Tile variant="label" /></p>
      </div>
    </div>

    <div className="match-replay__controls">
      <Tile variant="button" />
      <Tile variant="text" />
      <Tile variant="label" />
      <Tile variant="button" />
    </div>

    <div className="replay-roster">
      <div className="replay-roster__title"><Tile variant="label" /></div>
      <div className="replay-roster__teams">
        {Array.from({ length: teams }, (_, index) => (
          <div className="replay-roster__team" key={index}>
            <div className="replay-roster__team-head">
              <Tile variant="label" />
            </div>
            <div className="replay-roster__members">
              {Array.from({ length: 4 }, (_, row) => <Tile key={row} variant="text" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  </SkeletonFrame>
);

export default ReplayPaneSkeleton;
