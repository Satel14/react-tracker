import React from "react";
import { SkeletonFrame, SkeletonTile as Tile } from "../Skeleton";

const StatTile = () => (
  <div className="player-stat-tile">
    <Tile variant="label" />
    <Tile variant="heading" />
  </div>
);

const StatCard = ({ overviewTiles, advancedTiles }) => (
  <section className="player-card">
    <div className="player-card__head">
      <Tile variant="heading" />
    </div>

    <div className="player-stat-grid">
      {Array.from({ length: overviewTiles }, (_, index) => <StatTile key={index} />)}
    </div>

    <div className="player-card__divider" />

    <div className="player-stat-grid player-stat-grid--dense">
      {Array.from({ length: advancedTiles }, (_, index) => <StatTile key={index} />)}
    </div>
  </section>
);

// Wears the page's own classes so the hero card, the grids and the tiles come
// out the size they will be once the data lands. The tile counts come from the
// page for the same reason: they set the placeholder's height.
const PlayerPageSkeleton = ({ label, overviewTiles = 8, advancedTiles = 15, statCards = 1 }) => (
  <SkeletonFrame className="playerpage playerpage--compact" label={label}>
    <div className="playerpage-buttons">
      {Array.from({ length: 4 }, (_, index) => <Tile key={index} variant="button" />)}
    </div>

    <section className="player-card player-card--header player-card--tier-unranked">
      <div className="player-hero-rank">
        <span className="skeleton player-hero-rank__badge" aria-hidden="true" />
        <div className="player-hero-rank__progress">
          <div className="player-rank-progress__path">
            <Tile variant="label" />
          </div>
          <div className="player-rank-progress__track" />
          <div className="player-rank-progress__details">
            <Tile variant="label" />
          </div>
        </div>
      </div>

      <div className="player-hero-main">
        <div className="player-identity player-identity--minimal">
          <div className="player-identity__meta">
            <div className="player-identity__name">
              <Tile variant="title" />
            </div>
            <div className="player-identity__badges">
              {Array.from({ length: 3 }, (_, index) => <Tile key={index} variant="chip" />)}
            </div>
          </div>
        </div>

        <div className="player-quick-grid">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="player-quick-stat" key={index}>
              <Tile variant="label" />
              <Tile variant="heading" />
            </div>
          ))}
        </div>
      </div>
    </section>

    <div className="player-tabs player-tabs--loading">
      {Array.from({ length: 5 }, (_, index) => <Tile key={index} variant="button" />)}
    </div>

    {Array.from({ length: statCards }, (_, index) => (
      <StatCard key={index} overviewTiles={overviewTiles} advancedTiles={advancedTiles} />
    ))}
  </SkeletonFrame>
);

export default PlayerPageSkeleton;
