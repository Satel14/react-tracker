import React from "react";
import { SkeletonFrame } from "../Skeleton";

const CELLS = 7;

const Row = ({ head = false }) => (
  <div className={`match-scoreboard__row${head ? " match-scoreboard__row--head" : ""}`}>
    {Array.from({ length: CELLS }, (_, index) => (
      <span key={index} className="skeleton skeleton--cell" aria-hidden="true" />
    ))}
  </div>
);

// Seven cells per row on purpose: .match-scoreboard__row is a seven-column
// grid, so a row with any other count puts its placeholders in columns the
// real table does not use.
const MatchScoreboardSkeleton = ({ label, teams = 4, playersPerTeam = 4 }) => (
  <SkeletonFrame className="match-scoreboard" label={label}>
    {Array.from({ length: teams }, (_, team) => (
      <div className="match-scoreboard__team" key={team}>
        <div className="match-scoreboard__team-head">
          <span className="skeleton skeleton--chip" aria-hidden="true" />
        </div>
        <div className="match-scoreboard__rows">
          <Row head />
          {Array.from({ length: playersPerTeam }, (_, player) => <Row key={player} />)}
        </div>
      </div>
    ))}
  </SkeletonFrame>
);

export default MatchScoreboardSkeleton;
