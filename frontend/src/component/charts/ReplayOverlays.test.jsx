import React from "react";
import { render, screen } from "@testing-library/react";
import ReplayOverlays from "./ReplayOverlays";

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
