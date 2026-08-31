import React from "react";
import { feedAt } from "../../helpers/replayFeed";
import { teamColor, teamColorIndex } from "./replaySprites";
import { WEAPON_GLYPHS, GLYPH_BOX } from "./weaponGlyphs";

// The stage reads pan/zoom from pointer events on its own wrapper, so any
// overlay pixel that swallows a pointer silently freezes dragging in that
// corner of the map. Kept inline so a stylesheet refactor cannot drop it.
const PASSTHROUGH = { pointerEvents: "none" };

const clampHealth = (row) => {
  if (!row.alive) return 0;
  const h = Number(row.h);
  if (!Number.isFinite(h)) return 100;
  return Math.max(0, Math.min(100, h));
};

const stateOf = (row) => (!row.alive ? "dead" : row.knocked ? "knocked" : "alive");

const STATE_KEY = {
  alive: "pages.replay.stateAlive",
  knocked: "pages.replay.stateKnocked",
  dead: "pages.replay.stateDead",
};

// Last entry whose t has already passed; 0 before the first one. The array is
// at most ~9 long, so a scan is both correct and cheaper to read than a search.
export const phaseAt = (phases, displayT) => {
  const at = Number.isFinite(displayT) ? displayT : 0;
  let phase = 0;
  for (const entry of phases || []) {
    if (entry && entry.t <= at) phase = entry.p;
    else break;
  }
  return phase;
};

export const formatElapsed = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The weapon, drawn rather than named. Labelled with the exact gun, so a
// reader who cannot see the picture is told "AUG" and not "assault rifle" --
// the class is what got drawn, never what got said.
const WeaponGlyph = ({ kind, name }) => {
  const d = WEAPON_GLYPHS[kind];
  if (!d) return null;
  return (
    <svg
      className="replay-feed__weapon"
      role="img"
      focusable="false"
      viewBox={`0 0 ${GLYPH_BOX.w} ${GLYPH_BOX.h}`}
    >
      <title>{name || kind}</title>
      <path d={d} fill="currentColor" />
    </svg>
  );
};

// A crosshair for a headshot and a downed figure for a knock: the two marks
// the game puts between the weapon and the name. Both are decoration in the
// tree and carry their meaning in a label beside them, so neither is read out
// twice and neither is read out as nothing.
const HeadshotMark = () => (
  <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
    <circle cx="8" cy="8" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M8 0.5 L8 3.5 M8 12.5 L8 15.5 M0.5 8 L3.5 8 M12.5 8 L15.5 8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const KnockMark = () => (
  <svg viewBox="0 0 20 16" focusable="false" aria-hidden="true">
    <circle cx="15.5" cy="5" r="2.8" fill="currentColor" />
    <path d="M5 8 L14 6 L15 9.5 L6 11.5 Z" fill="currentColor" />
    <path d="M13.5 7 L19.5 9.5 L18.5 12 L12.5 9.5 Z" fill="currentColor" />
    <path d="M5 8 L8 8 L6 14.5 L2.5 14.5 Z" fill="currentColor" />
    <path d="M7.5 9.5 L10.5 9.5 L9.5 14.5 L6.5 14.5 Z" fill="currentColor" />
  </svg>
);

// One end of a feed line. The team number sits on the outside of each name --
// number, killer, weapon, victim, number -- which is the order the game writes
// and reads outward from the pair in the middle.
//
// The colour lives on the badge, not on the name: a long nickname painted in
// team colour is a block of colour, and the number is what the eye is matching
// against the map anyway. The focal team has no palette colour by design
// (teamColorIndex sends it to index 0, which is not a team colour), so it is
// marked by class and the overlay's own styling takes it from there.
//
// Which end this is has to be in the markup and not merely in the order: a
// kill greys the victim out and a knock does not, and that is a rule about the
// end, not about the position.
const FeedSide = ({ side, focalTeamId, role }) => {
  const colour = teamColor(teamColorIndex(side.teamId, focalTeamId));
  const badge = side.teamId == null
    ? null
    : (
      <span
        className={`replay-feed__team${side.isFocal ? " is-focal" : ""}`}
        style={colour ? { background: colour } : undefined}
      >
        {side.teamId}
      </span>
    );
  const name = <span className="replay-feed__name">{side.name}</span>;
  const mirrored = role === "victim";

  return (
    <span className={`replay-feed__side is-${role}${side.isFocal ? " is-focal" : ""}`}>
      {mirrored ? name : badge}
      {badge && name ? " " : null}
      {mirrored ? badge : name}
    </span>
  );
};

const ReplayOverlays = ({ rows = [], phases = [], t, displayT = 0, focalTeamId = null, feed = [] }) => {
  const list = rows || [];
  // Windowed here rather than handed down already sliced, for the same reason
  // phaseAt is called here: it is a function of the playhead, so scrubbing --
  // in either direction -- needs no notification and no state to reset.
  const shown = feedAt(feed, displayT);
  const alive = list.filter((row) => row && row.alive);
  const teamsAlive = new Set(alive.map((row) => row.teamId ?? "none")).size;
  const members = focalTeamId == null ? [] : list.filter((row) => row && row.teamId === focalTeamId);

  return (
    <div className="replay-overlay" style={PASSTHROUGH}>
      <div className="replay-overlay__alive" style={PASSTHROUGH}>
        <span className="replay-overlay__alive-players">
          {t("pages.replay.aliveCount", { count: alive.length })}
        </span>
        <span className="replay-overlay__alive-teams">
          {t("pages.replay.teamsAlive", { count: teamsAlive })}
        </span>
      </div>

      <div className="replay-overlay__clock" style={PASSTHROUGH}>
        <span className="replay-overlay__time">{formatElapsed(displayT)}</span>
        <span className="replay-overlay__phase">
          {t("pages.replay.phase", { phase: phaseAt(phases, displayT) })}
        </span>
      </div>

      {shown.length > 0 && (
        <div className="replay-feed" style={PASSTHROUGH}>
          {shown.map((line) => (
            <div key={line.id} className={`replay-feed__line is-${line.kind}`}>
              {line.killer ? (
                <FeedSide side={line.killer} focalTeamId={focalTeamId} role="killer" />
              ) : null}
              {line.killer ? " " : null}
              {/* A silhouette when the class is known, the name when it is not:
                  the zone and a fall have no picture, and neither does a gun
                  shipped after the classifier's table was written. */}
              {line.icon ? (
                <WeaponGlyph kind={line.icon} name={line.weapon} />
              ) : line.weapon ? (
                <span className="replay-feed__weapon-name">{line.weapon}</span>
              ) : null}
              {line.headshot ? (
                <span className="replay-feed__headshot">
                  <HeadshotMark />
                  <span className="sr-only">{t("pages.replay.headshotMark")}</span>
                </span>
              ) : null}
              {line.kind === "knock" ? (
                <span className="replay-feed__knock">
                  <KnockMark />
                  <span className="sr-only">{t("pages.replay.knockMark")}</span>
                </span>
              ) : null}
              {line.weapon ? " " : null}
              <FeedSide side={line.victim} focalTeamId={focalTeamId} role="victim" />
            </div>
          ))}
        </div>
      )}

      {members.length > 0 && (
        <div className="replay-overlay__team" style={PASSTHROUGH}>
          <div className="replay-overlay__team-title">{t("pages.replay.yourTeam")}</div>
          {members.map((row, i) => {
            const state = stateOf(row);
            return (
              <div
                key={row.accountId || `${row.name}-${i}`}
                className={`replay-overlay__member is-${state}`}
              >
                <span className="replay-overlay__member-name">{row.name}</span>
                <span className="replay-overlay__health">
                  <span
                    className="replay-overlay__health-fill"
                    style={{ width: `${clampHealth(row)}%` }}
                  />
                </span>
                <span className="replay-overlay__state">{t(STATE_KEY[state])}</span>
                <span className="replay-overlay__kills">
                  {t("pages.replay.killsShort", { count: row.kills || 0 })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReplayOverlays;
