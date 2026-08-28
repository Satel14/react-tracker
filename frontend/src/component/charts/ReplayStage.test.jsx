import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ReplayStage from "./ReplayStage";
import { createClockCore } from "../../helpers/replayClockCore";

const data = {
  rawMapName: "Baltic_Main",
  mapName: "Erangel",
  mapMax: 8160,
  duration: 100,
  focalAccountId: "a.me",
  focalTeamId: 1,
  totalPlayers: 2,
  totalTeams: 2,
  players: [
    { name: "Me", accountId: "a.me", teamId: 1, isFocal: true, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 4000, y: 4000 }, { t: 10, x: 4100, y: 4100 }] },
    { name: "Foe", accountId: "a.foe", teamId: 2, isFocal: false, dropTime: null, deathTime: null,
      positions: [{ t: 0, x: 2000, y: 6000 }, { t: 10, x: 2000, y: 6000 }] },
  ],
  kills: [],
  zones: [{ t: 0, bx: 4000, by: 4000, br: 2000, wx: 4500, wy: 4200, wr: 900, phase: 1 }],
};

const renderStage = (over = {}) => {
  const clockRef = { current: createClockCore({ duration: data.duration }) };
  const utils = render(
    <ReplayStage data={data} clockRef={clockRef} focusedAccountId={null} onSelect={() => {}} mapLabel="Erangel" {...over} />
  );
  return { ...utils, clockRef };
};

test("exposes the stage canvas as an image with the map name", async () => {
  renderStage();
  expect(await screen.findByRole("img", { name: /erangel/i })).toBeInTheDocument();
});

test("survives a wheel gesture with no 2D context", () => {
  const { container } = renderStage();
  const stage = container.querySelector(".replay-stage");
  expect(() => {
    fireEvent.wheel(stage, { deltaY: -120, deltaMode: 0 });
    fireEvent.wheel(stage, { deltaY: 3, deltaMode: 0, ctrlKey: true });
    fireEvent.wheel(stage, { deltaY: 2, deltaMode: 1 });
  }).not.toThrow();
});

test("survives a pointer drag and a stray pointer release", () => {
  const { container } = renderStage();
  const stage = container.querySelector(".replay-stage");
  expect(() => {
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    fireEvent.pointerUp(stage, { pointerId: 9 });
  }).not.toThrow();
});

test("renders two canvas layers", () => {
  const { container } = renderStage();
  expect(container.querySelectorAll("canvas")).toHaveLength(2);
});

test("unmounts without leaving a pending frame", () => {
  const { unmount } = renderStage();
  expect(() => unmount()).not.toThrow();
});
