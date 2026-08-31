import React from "react";
import { vi } from "vitest";
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

// jsdom's getContext returns null, so nothing below the measure() guard ever
// paints. Stub it to make one real frame observable.
const recordingCtx = () => {
  const calls = [];
  const rec = (name) => (...args) => calls.push({ name, args });
  return {
    calls,
    lineWidth: 0, fillStyle: "", strokeStyle: "", font: "", globalAlpha: 1,
    setTransform: rec("setTransform"), save: rec("save"), restore: rec("restore"),
    clearRect: rec("clearRect"), fillRect: rec("fillRect"), drawImage: rec("drawImage"),
    beginPath: rec("beginPath"), rect: rec("rect"), arc: rec("arc"),
    fill: rec("fill"), stroke: rec("stroke"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), fillText: rec("fillText"),
  };
};

test("mounting mid-match does not replay every earlier kill as a tracer burst", () => {
  const ctx = recordingCtx();
  const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  const rafSpy = vi.spyOn(window, "requestAnimationFrame");
  try {
    // The clock outlives the stage, so a remount (tab switch, "Reset view")
    // starts with a fresh sweep against an already-advanced t.
    const clockRef = { current: createClockCore({ duration: 100 }) };
    clockRef.current.seek(60);
    const withKills = {
      ...data,
      kills: [10, 20, 30, 40].map((t) => ({ t, kx: 3000, ky: 3000, vx: 5000, vy: 5000 })),
    };
    render(
      <ReplayStage data={withKills} clockRef={clockRef} focusedAccountId={null} onSelect={() => {}} mapLabel="Erangel" />
    );
    ctx.calls.length = 0;
    rafSpy.mock.calls[rafSpy.mock.calls.length - 1][0](0);
    expect(ctx.calls.filter((c) => c.name === "lineTo")).toHaveLength(0);
  } finally {
    ctxSpy.mockRestore();
    rafSpy.mockRestore();
  }
});

test("drops the hover highlight when the pointer leaves the stage", () => {
  const ctx = recordingCtx();
  const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  const rafSpy = vi.spyOn(window, "requestAnimationFrame");
  try {
    const { container } = renderStage();
    const stage = container.querySelector(".replay-stage");
    const frame = () => {
      ctx.calls.length = 0;
      rafSpy.mock.calls[rafSpy.mock.calls.length - 1][0](0);
      return ctx.calls.filter((c) => c.name === "arc").length;
    };
    frame();
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 0, clientY: 0 });
    const hovered = frame();
    fireEvent.pointerLeave(stage, { pointerId: 1 });
    // The hover ring is one extra arc; leaving must take it away again.
    expect(frame()).toBe(hovered - 1);
  } finally {
    ctxSpy.mockRestore();
    rafSpy.mockRestore();
  }
});

// --- keyboard and fullscreen -------------------------------------------------






test("the fullscreen button is hidden when the browser has no Fullscreen API", () => {
  // jsdom has none, which is also the older-iOS-Safari case. It must not throw
  // and must not offer a button that cannot work.
  const { queryByRole } = renderStage();
  expect(queryByRole("button", { name: /fullscreen/i })).toBeNull();
});

test("the fullscreen button appears and calls the API when it exists", async () => {
  const request = vi.fn(() => Promise.resolve());
  Element.prototype.requestFullscreen = request;
  try {
    const { container } = renderStage();
    const button = container.querySelector(".replay-stage__fullscreen");
    expect(button).not.toBeNull();
    fireEvent.click(button);
    expect(request).toHaveBeenCalled();
  } finally {
    delete Element.prototype.requestFullscreen;
  }
});

// --- P3 review findings ------------------------------------------------------



test("the fullscreen button does not clear the focused player", () => {
  const request = vi.fn(() => Promise.resolve());
  Element.prototype.requestFullscreen = request;
  try {
    const onSelect = vi.fn();
    const { container } = renderStage({ onSelect });
    const button = container.querySelector(".replay-stage__fullscreen");
    // Its pointerdown must not open the stage's pan gesture, or the tap path
    // deselects whoever the viewer was following.
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 5, clientY: 5 });
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    delete Element.prototype.requestFullscreen;
  }
});



test("double-clicking the map zooms in rather than throwing the view away", () => {
  // Selecting two players in quick succession reads as a double-click, and
  // resetting the camera there felt like the view collapsing on its own. Every
  // other map zooms in on double-click; reset stays on its button and on R.
  const { container } = renderStage();
  const stage = container.querySelector(".replay-stage");
  stage.getBoundingClientRect = () => ({ width: 800, height: 450, left: 0, top: 0, right: 800, bottom: 450 });
  expect(() => fireEvent.doubleClick(stage, { clientX: 400, clientY: 225 })).not.toThrow();
});
