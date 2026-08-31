import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import ReplayOverlays from "./ReplayOverlays";
import { teamColor, teamColorIndex } from "./replaySprites";
import { WEAPON_GLYPHS } from "./weaponGlyphs";

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const rows = [
  { name: "Me", accountId: "a.me", teamId: 1, kills: 3, alive: true, knocked: false, h: 80, isFocal: true },
  { name: "Mate", accountId: "a.mate", teamId: 1, kills: 1, alive: true, knocked: true, h: 40, isFocal: true },
  { name: "Downed", accountId: "a.down", teamId: 1, kills: 0, alive: false, knocked: false, h: 0, isFocal: true },
  { name: "Foe", accountId: "a.foe", teamId: 2, kills: 2, alive: true, knocked: false, h: 100, isFocal: false },
  { name: "Ghost", accountId: "a.ghost", teamId: 3, kills: 0, alive: false, knocked: false, h: 0, isFocal: false },
];

const phases = [
  { t: 60, p: 1 },
  { t: 180, p: 2 },
  { t: 300, p: 3 },
];

const renderOverlays = (over = {}) =>
  render(
    <ReplayOverlays
      rows={rows}
      phases={phases}
      t={t}
      displayT={0}
      focalTeamId={1}
      {...over}
    />
  );

const root = (container) => container.querySelector(".replay-overlay");

test("counts the players and the teams still alive", () => {
  const { container } = renderOverlays();
  expect(screen.getByText('pages.replay.aliveCount:{"count":3}')).toBeInTheDocument();
  expect(screen.getByText('pages.replay.teamsAlive:{"count":2}')).toBeInTheDocument();
  expect(container.querySelector(".replay-overlay__alive")).toBeInTheDocument();
});

test("counts zero players and zero teams when the roster is wiped", () => {
  const wiped = rows.map((r) => ({ ...r, alive: false, knocked: false, h: 0 }));
  const { container } = renderOverlays({ rows: wiped });
  expect(screen.getByText('pages.replay.aliveCount:{"count":0}')).toBeInTheDocument();
  expect(screen.getByText('pages.replay.teamsAlive:{"count":0}')).toBeInTheDocument();
  expect(root(container)).toBeInTheDocument();
});

test("lists only the members of the focal team", () => {
  const { container } = renderOverlays();
  const names = [...container.querySelectorAll(".replay-overlay__member-name")].map((n) => n.textContent);
  expect(names).toEqual(["Me", "Mate", "Downed"]);
  expect(screen.queryByText("Foe")).not.toBeInTheDocument();
  expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
});

test("renders no focal team card when focalTeamId is null", () => {
  const { container } = renderOverlays({ focalTeamId: null });
  expect(container.querySelector(".replay-overlay__team")).toBeNull();
  expect(root(container)).toBeInTheDocument();
});

test("renders no focal team card when no roster row belongs to the focal team", () => {
  const { container } = renderOverlays({ focalTeamId: 99 });
  expect(container.querySelector(".replay-overlay__team")).toBeNull();
});

test("marks each focal member alive, knocked or dead and shows their kills", () => {
  const { container } = renderOverlays();
  const members = [...container.querySelectorAll(".replay-overlay__member")];
  expect(members).toHaveLength(3);
  expect(members[0].className).toContain("is-alive");
  expect(members[1].className).toContain("is-knocked");
  expect(members[2].className).toContain("is-dead");
  expect(members[0]).toHaveTextContent("pages.replay.stateAlive");
  expect(members[1]).toHaveTextContent("pages.replay.stateKnocked");
  expect(members[2]).toHaveTextContent("pages.replay.stateDead");
  expect(members[0]).toHaveTextContent('pages.replay.killsShort:{"count":3}');
});

test("sizes each health bar from the member health", () => {
  const { container } = renderOverlays();
  const fills = [...container.querySelectorAll(".replay-overlay__health-fill")];
  expect(fills.map((f) => f.style.width)).toEqual(["80%", "40%", "0%"]);
});

test("clamps out-of-range and missing health values", () => {
  const odd = [
    { name: "Over", accountId: "a.1", teamId: 1, kills: 0, alive: true, knocked: false, h: 140 },
    { name: "Under", accountId: "a.2", teamId: 1, kills: 0, alive: true, knocked: false, h: -20 },
    { name: "Unknown", accountId: "a.3", teamId: 1, kills: 0, alive: true, knocked: false },
    { name: "Corpse", accountId: "a.4", teamId: 1, kills: 0, alive: false, knocked: false, h: 55 },
  ];
  const { container } = renderOverlays({ rows: odd });
  const fills = [...container.querySelectorAll(".replay-overlay__health-fill")];
  expect(fills.map((f) => f.style.width)).toEqual(["100%", "0%", "100%", "0%"]);
});

test("shows phase 0 before the first phase entry", () => {
  renderOverlays({ displayT: 0 });
  expect(screen.getByText('pages.replay.phase:{"phase":0}')).toBeInTheDocument();
});

test("steps the phase at every boundary and holds after the last", () => {
  const { rerender } = renderOverlays({ displayT: 59.9 });
  const at = (displayT) => {
    rerender(
      <ReplayOverlays rows={rows} phases={phases} t={t} displayT={displayT} focalTeamId={1} />
    );
    return screen.getByText(/^pages\.replay\.phase:/).textContent;
  };
  expect(at(59.9)).toBe('pages.replay.phase:{"phase":0}');
  expect(at(60)).toBe('pages.replay.phase:{"phase":1}');
  expect(at(179.9)).toBe('pages.replay.phase:{"phase":1}');
  expect(at(180)).toBe('pages.replay.phase:{"phase":2}');
  expect(at(299.9)).toBe('pages.replay.phase:{"phase":2}');
  expect(at(300)).toBe('pages.replay.phase:{"phase":3}');
  expect(at(9999)).toBe('pages.replay.phase:{"phase":3}');
});

test("formats the elapsed time as M:SS", () => {
  const { container, rerender } = renderOverlays({ displayT: 0 });
  const at = (displayT) => {
    rerender(
      <ReplayOverlays rows={rows} phases={phases} t={t} displayT={displayT} focalTeamId={1} />
    );
    return container.querySelector(".replay-overlay__time").textContent;
  };
  expect(at(0)).toBe("0:00");
  expect(at(9)).toBe("0:09");
  expect(at(65)).toBe("1:05");
  expect(at(65.9)).toBe("1:05");
  expect(at(600)).toBe("10:00");
  expect(at(3600)).toBe("60:00");
  expect(at(3665)).toBe("61:05");
  expect(at(-5)).toBe("0:00");
  expect(at(undefined)).toBe("0:00");
});

test("regression guard: the overlay root and its panels keep pointer-events none so map pan and zoom still work", () => {
  const { container } = renderOverlays();
  const el = root(container);
  expect(el.style.pointerEvents).toBe("none");
  expect(el).toHaveStyle({ pointerEvents: "none" });
  for (const sel of [".replay-overlay__alive", ".replay-overlay__clock", ".replay-overlay__team"]) {
    const panel = container.querySelector(sel);
    expect(panel).toBeInTheDocument();
    expect(panel.style.pointerEvents).toBe("none");
  }
  expect(container.querySelectorAll('[style*="pointer-events: auto"]')).toHaveLength(0);
});

test("renders without throwing when rows, phases and focalTeamId are all missing", () => {
  expect(() => render(<ReplayOverlays t={t} displayT={0} />)).not.toThrow();
  expect(screen.getByText('pages.replay.aliveCount:{"count":0}')).toBeInTheDocument();
  expect(screen.getByText('pages.replay.phase:{"phase":0}')).toBeInTheDocument();
});

test("renders without throwing when phases is empty", () => {
  const { container } = renderOverlays({ phases: [] });
  expect(container.querySelector(".replay-overlay__phase").textContent)
    .toBe('pages.replay.phase:{"phase":0}');
});

// ---------------------------------------------------------------------------
// Kill feed
// ---------------------------------------------------------------------------

const feedEvents = [
  {
    id: "knock:7:90:a.foe", t: 90, kind: "knock",
    killer: { name: "Me", teamId: 1, isFocal: true },
    victim: { name: "Foe", teamId: 22, isFocal: false },
    weapon: "M416", dist: 40,
  },
  {
    id: "kill:95:a.foe", t: 95, kind: "kill",
    killer: { name: "Me", teamId: 1, isFocal: true },
    victim: { name: "Foe", teamId: 22, isFocal: false },
    weapon: "AUG", dist: 87,
  },
  {
    id: "kill:96:a.mate", t: 96, kind: "kill",
    killer: null,
    victim: { name: "Mate", teamId: 1, isFocal: true },
    weapon: "Blue Zone", dist: null,
  },
];

const lines = (container) => [...container.querySelectorAll(".replay-feed__line")];

test("shows no feed at all when nothing has happened yet", () => {
  const { container } = renderOverlays({ feed: feedEvents, displayT: 0 });
  expect(container.querySelector(".replay-feed")).toBeNull();
});

test("writes a kill line as team, killer, weapon, victim, team", () => {
  const { container } = renderOverlays({ feed: feedEvents, displayT: 95 });
  const line = lines(container).find((el) => el.textContent.includes("AUG"));

  // Order matters: this is the line the game writes, read left to right.
  expect(line.textContent.replace(/\s+/g, " ").trim()).toBe("1 Me AUG Foe 22");
});

test("marks a knock line and leaves a kill line unmarked", () => {
  const { container } = renderOverlays({ feed: feedEvents, displayT: 95 });
  const knockLine = lines(container).find((el) => el.textContent.includes("M416"));
  const killLine = lines(container).find((el) => el.textContent.includes("AUG"));

  expect(knockLine.querySelector(".replay-feed__knock")).toBeInTheDocument();
  expect(killLine.querySelector(".replay-feed__knock")).toBeNull();
});

test("names the knock mark for a reader who cannot see it", () => {
  const { container } = renderOverlays({ feed: feedEvents, displayT: 90 });
  const mark = container.querySelector(".replay-feed__knock");

  // The mark is the only thing separating a knock from a kill, so it cannot be
  // decoration: it carries a label, and the icon itself stays out of the tree
  // so the label is not read twice.
  expect(mark.textContent).toContain("pages.replay.knockMark");
  expect(mark.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
});

test("gives a death nobody caused no killer side", () => {
  const { container } = renderOverlays({ feed: feedEvents, displayT: 96 });
  const line = lines(container).find((el) => el.textContent.includes("Blue Zone"));

  expect(line.textContent.replace(/\s+/g, " ").trim()).toBe("Blue Zone Mate 1");
  expect(line.querySelectorAll(".replay-feed__team")).toHaveLength(1);
});

test("ages a line out without being told the playhead moved backwards", () => {
  const { container, rerender } = render(
    <ReplayOverlays rows={rows} phases={phases} t={t} displayT={400} focalTeamId={1} feed={feedEvents} />
  );
  expect(lines(container)).toHaveLength(0);

  rerender(
    <ReplayOverlays rows={rows} phases={phases} t={t} displayT={95} focalTeamId={1} feed={feedEvents} />
  );
  expect(lines(container).length).toBeGreaterThan(0);
});

test("the feed swallows no pointer events either", () => {
  const { container } = renderOverlays({ feed: feedEvents, displayT: 95 });
  expect(container.querySelector(".replay-feed").style.pointerEvents).toBe("none");
  expect(container.querySelectorAll('[style*="pointer-events: auto"]')).toHaveLength(0);
});

// --- the feed line as the game draws it -----------------------------------

const shotEvents = [
  {
    id: "kill:95:a.foe", t: 95, kind: "kill",
    killer: { name: "Me", teamId: 1, isFocal: true },
    victim: { name: "Foe", teamId: 22, isFocal: false },
    weapon: "AUG", icon: "ar", headshot: true, dist: 87,
  },
  {
    id: "knock:94:a.foe", t: 94, kind: "knock",
    killer: { name: "Me", teamId: 1, isFocal: true },
    victim: { name: "Foe", teamId: 22, isFocal: false },
    weapon: "M416", icon: "ar", headshot: false, dist: 40,
  },
  {
    id: "kill:93:a.mate", t: 93, kind: "kill",
    killer: null,
    victim: { name: "Mate", teamId: 1, isFocal: true },
    weapon: "Blue Zone", icon: null, headshot: false, dist: null,
  },
];

const lineWith = (container, text) =>
  lines(container).find((el) => el.textContent.includes(text));

test("draws the weapon as a silhouette and labels it with the gun", () => {
  const { container } = renderOverlays({ feed: shotEvents, displayT: 95 });
  const line = lineWith(container, "AUG");
  const glyph = line.querySelector(".replay-feed__weapon");

  // A picture of the class, named with the exact gun -- so a reader who cannot
  // see it is told "AUG" and not "assault rifle".
  expect(glyph.tagName.toLowerCase()).toBe("svg");
  expect(glyph).toHaveAttribute("role", "img");
  expect(glyph.querySelector("title").textContent).toBe("AUG");
  expect(glyph.querySelector("path")).toHaveAttribute("d", WEAPON_GLYPHS.ar);
});

test("names what killed with no silhouette when nothing shot", () => {
  const { container } = renderOverlays({ feed: shotEvents, displayT: 93 });
  const line = lineWith(container, "Blue Zone");

  // The game writes a bare line for a zone death; inventing a gun picture for
  // it would report something that did not happen.
  expect(line.querySelector("svg.replay-feed__weapon")).toBeNull();
  expect(line.textContent).toContain("Blue Zone");
});

test("marks a headshot and leaves a body shot unmarked", () => {
  const { container } = renderOverlays({ feed: shotEvents, displayT: 95 });

  expect(lineWith(container, "AUG").querySelector(".replay-feed__headshot")).toBeInTheDocument();
  expect(lineWith(container, "M416").querySelector(".replay-feed__headshot")).toBeNull();
});

test("names the headshot mark for a reader who cannot see it", () => {
  const { container } = renderOverlays({ feed: shotEvents, displayT: 95 });
  const mark = lineWith(container, "AUG").querySelector(".replay-feed__headshot");

  expect(mark.textContent).toContain("pages.replay.headshotMark");
  expect(mark.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
});

test("uses the game's own marks for a headshot and a knock", () => {
  // Drawn stand-ins to begin with; these are the real ones, out of the same
  // killfeed folder PUBG's own 2D replay reads.
  const { container } = renderOverlays({ feed: shotEvents, displayT: 95 });

  expect(lineWith(container, "AUG").querySelector(".replay-feed__headshot img"))
    .toHaveAttribute("src", "/images/weapon-icons/_headshot.png");
  expect(lineWith(container, "M416").querySelector(".replay-feed__knock img"))
    .toHaveAttribute("src", "/images/weapon-icons/_dbno.png");
});

test("puts the team number in a badge painted that team's colour", () => {
  const { container } = renderOverlays({ feed: shotEvents, displayT: 95, focalTeamId: 1 });
  const line = lineWith(container, "AUG");
  const [killerBadge, victimBadge] = [...line.querySelectorAll(".replay-feed__team")];

  // The colour moved off the name and onto the badge -- which is what the game
  // does, and what stops a long nickname being a block of team colour.
  expect(victimBadge.textContent).toBe("22");
  expect(victimBadge).toHaveStyle({ backgroundColor: teamColor(teamColorIndex(22, 1)) });
  // The focal team has no palette colour by design, so it is marked by class.
  expect(killerBadge.className).toContain("is-focal");
  expect(killerBadge).not.toHaveAttribute("style");
});

test("tells the killer's end of a line from the victim's", () => {
  const { container } = renderOverlays({ feed: shotEvents, displayT: 95 });
  const line = lineWith(container, "AUG");

  // A kill greys out the victim and a knock does not, and that is a rule about
  // which end of the line it is -- so which end has to be in the markup.
  expect(line.querySelector(".replay-feed__side.is-killer").textContent).toContain("Me");
  expect(line.querySelector(".replay-feed__side.is-victim").textContent).toContain("Foe");
});

// --- the game's own weapon icon, with the drawn silhouette behind it -------

const iconEvents = [
  {
    id: "kill:95:a.foe", t: 95, kind: "kill",
    killer: { name: "Me", teamId: 1, isFocal: true },
    victim: { name: "Foe", teamId: 22, isFocal: false },
    weapon: "AUG", icon: "ar", iconKey: "aug_a3", headshot: false, dist: 87,
  },
  {
    id: "kill:94:a.mate", t: 94, kind: "kill",
    killer: { name: "Me", teamId: 1, isFocal: true },
    victim: { name: "Mate", teamId: 1, isFocal: true },
    weapon: "Scar-L", icon: "ar", iconKey: null, headshot: false, dist: 12,
  },
];

test("shows the game's own icon for a gun it has one for", () => {
  const { container } = renderOverlays({ feed: iconEvents, displayT: 95 });
  // Found by its accessible name rather than by the line's text: with a real
  // icon the gun's name is the alt and is deliberately not in the text.
  const img = container.querySelector("img.replay-feed__weapon");

  expect(img).toHaveAttribute("src", "/images/weapon-icons/aug_a3.png");
  // Named with the gun, not the file: the picture is of an AUG.
  expect(img).toHaveAttribute("alt", "AUG");
  expect(img.closest(".replay-feed__line").querySelector("svg.replay-feed__weapon")).toBeNull();
});

test("falls back to the drawn silhouette for a gun it has none of", () => {
  const { container } = renderOverlays({ feed: iconEvents, displayT: 94 });
  const line = lineWith(container, "Scar-L");

  expect(line.querySelector("img.replay-feed__weapon")).toBeNull();
  expect(line.querySelector("svg.replay-feed__weapon")).toBeInTheDocument();
  expect(line.querySelector("svg.replay-feed__weapon path")).toHaveAttribute("d", WEAPON_GLYPHS.ar);
});

test("names a weapon it can draw neither an icon nor a silhouette for", () => {
  // A class the backend starts sending before this side has a drawing for it.
  // Substituting some other gun would report a weapon that was not used, and
  // rendering nothing would lose the kill's cause entirely -- so it falls all
  // the way back to the name, the same place a zone death lands.
  const { container } = renderOverlays({
    feed: [{
      id: "kill:95:x", t: 95, kind: "kill",
      killer: { name: "Me", teamId: 1, isFocal: true },
      victim: { name: "Foe", teamId: 22, isFocal: false },
      weapon: "Flamethrower", icon: "flamethrower", iconKey: null, headshot: false,
    }],
    displayT: 95,
  });
  const line = lines(container)[0];

  expect(line.querySelector(".replay-feed__weapon")).toBeNull();
  expect(line.querySelector(".replay-feed__weapon-name").textContent).toBe("Flamethrower");
});

// --- profile links over the map -------------------------------------------

describe("profile links in the feed", () => {
  const line = (over = {}) => ({
    id: "kill:95:a.foe", t: 95, kind: "kill",
    killer: { name: "Me", accountId: "account.me", teamId: 1, isFocal: true },
    victim: { name: "Foe", accountId: "account.foe", teamId: 22, isFocal: false },
    weapon: "AUG", icon: "ar", iconKey: "aug_a3", headshot: false, dist: 87,
    ...over,
  });
  const show = (feed, over = {}) => render(
    <MemoryRouter>
      <ReplayOverlays rows={rows} phases={phases} t={t} displayT={95} focalTeamId={1} feed={feed} platform="steam" {...over} />
    </MemoryRouter>
  );

  it("links both names", () => {
    const { container } = show([line()]);
    expect([...container.querySelectorAll(".replay-feed a")].map((a) => a.getAttribute("href")))
      .toEqual(["/player/steam/Me", "/player/steam/Foe"]);
  });

  it("leaves a bot's name and a causeless death unlinked", () => {
    const { container } = show([
      line({ id: "a", victim: { name: "Bot_Frank", accountId: "ai.1031", teamId: 22, isFocal: false } }),
      line({ id: "b", killer: null, weapon: "Blue Zone", icon: null, iconKey: null }),
    ]);
    // Sorted: the feed shows the newest line first, and which of the two got
    // rendered first is not what this test is about.
    expect([...container.querySelectorAll(".replay-feed a")].map((a) => a.textContent).sort())
      .toEqual(["Foe", "Me"]);
  });

  it("keeps the name's own colour, which is the point of the class", () => {
    // A kill turns the victim red and the focal side green. An antd-styled <a>
    // would paint over both, so every link here carries .profile-link.
    const { container } = show([line()]);
    const links = [...container.querySelectorAll(".replay-feed a")];
    expect(links).not.toHaveLength(0);
    for (const a of links) expect(a.className).toContain("profile-link");
  });

  it("takes the pointer only on the names, so the map still drags elsewhere", () => {
    // The overlay is deliberately pointer-transparent: any pixel of it that
    // swallows a pointer freezes dragging in that corner of the map. A link has
    // to take the pointer to be clickable, so only the link does -- and the
    // line, the badges and the weapon around it stay transparent.
    const { container } = show([line()]);
    expect(container.querySelector(".replay-feed").style.pointerEvents).toBe("none");
    for (const a of container.querySelectorAll(".replay-feed a")) {
      expect(a.className).toContain("replay-feed__link");
    }
  });
});
