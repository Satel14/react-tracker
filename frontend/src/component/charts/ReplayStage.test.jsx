import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

test("survives a pinch gesture and keeps the gesture alive after one finger lifts", () => {
  const onSelect = vi.fn();
  const { container } = renderStage({ onSelect });
  const stage = container.querySelector(".replay-stage");
  expect(() => {
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 40, clientY: 0 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: -10, clientY: 0 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 50, clientY: 0 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
  }).not.toThrow();
  // pointers.size === 0 rule: one finger is still down, so the release above
  // must not be mistaken for a completed tap-to-select.
  expect(onSelect).not.toHaveBeenCalled();
});

test("selects the tapped player but not after a drag past the move threshold", () => {
  const onSelect = vi.fn();
  const rafSpy = vi.spyOn(window, "requestAnimationFrame");
  const { container } = renderStage({ onSelect });
  // Run one frame so sampleTracks has placed the roster before we pick.
  rafSpy.mock.calls[0][0](0);
  const stage = container.querySelector(".replay-stage");

  fireEvent.pointerDown(stage, { pointerId: 5, clientX: 0, clientY: 0 });
  fireEvent.pointerUp(stage, { pointerId: 5, clientX: 0, clientY: 0 });
  expect(onSelect).toHaveBeenCalledWith("a.me");

  onSelect.mockClear();
  fireEvent.pointerDown(stage, { pointerId: 6, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(stage, { pointerId: 6, clientX: 20, clientY: 20 });
  fireEvent.pointerUp(stage, { pointerId: 6, clientX: 20, clientY: 20 });
  expect(onSelect).not.toHaveBeenCalled();

  rafSpy.mockRestore();
});

test("re-resolves canvas colours when the surrounding .app theme changes", async () => {
  const clockRef = { current: createClockCore({ duration: data.duration }) };
  const spy = vi.spyOn(window, "getComputedStyle");
  const { container } = render(
    <div className="app light">
      <ReplayStage data={data} clockRef={clockRef} focusedAccountId={null} onSelect={() => {}} mapLabel="Erangel" />
    </div>
  );
  try {
    const before = spy.mock.calls.length;
    container.querySelector(".app").className = "app dark";
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(before));
  } finally {
    spy.mockRestore();
  }
});

test("renders two canvas layers", () => {
  const { container } = renderStage();
  expect(container.querySelectorAll("canvas")).toHaveLength(2);
});

test("cancels the last scheduled frame on unmount", () => {
  const rafSpy = vi.spyOn(window, "requestAnimationFrame");
  const cafSpy = vi.spyOn(window, "cancelAnimationFrame");
  const { unmount } = renderStage();
  const lastId = rafSpy.mock.results[rafSpy.mock.results.length - 1].value;
  unmount();
  expect(cafSpy).toHaveBeenCalledWith(lastId);
  rafSpy.mockRestore();
  cafSpy.mockRestore();
});
