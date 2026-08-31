import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MapStage from "./MapStage";
import { MIN_ZOOM } from "../../helpers/replayCamera";

// jsdom hands back no 2D context, so nothing would paint and there would be
// nothing to observe. A recording stub gives the component a context to draw
// into and the test a record of what it drew with.
const fakeCtx = () => ({
  calls: [],
  setTransform() {},
  clearRect() {},
  fillRect() {},
  drawImage(...args) { this.calls.push({ name: "drawImage", args }); },
  beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() {}, fill() {},
  fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "",
});

let contexts = [];
let originalGetContext;

beforeEach(() => {
  contexts = [];
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    if (!this.__ctx) {
      this.__ctx = fakeCtx();
      contexts.push(this.__ctx);
    }
    return this.__ctx;
  };
  // jsdom reports every element as 0x0, and the stage does nothing without a
  // size. 600x600 is what a card gives it.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 600, height: 600, top: 0, left: 0, right: 600, bottom: 600, x: 0, y: 0,
  });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.restoreAllMocks();
});

const mount = (props = {}) => {
  const cams = [];
  const paint = vi.fn((ctx, view) => cams.push({ ...view.cam }));
  const utils = render(<MapStage rawMapName="Baltic_Main" paint={paint} {...props} />);
  return { ...utils, paint, cams, stage: utils.container.querySelector(".map-stage") };
};

describe("MapStage", () => {
  it("names itself after the map it is showing", () => {
    const { getByRole } = mount();
    expect(getByRole("img")).toHaveAttribute("aria-label", "Erangel");
  });

  it("draws under and over: a raster canvas and one for the caller", () => {
    const { container } = mount();
    expect(container.querySelector("canvas.map-stage__bg")).toBeInTheDocument();
    expect(container.querySelector("canvas.map-stage__fx")).toBeInTheDocument();
  });

  it("hands the caller a camera fitted to the whole map", () => {
    const { paint, cams } = mount();
    expect(paint).toHaveBeenCalled();
    const cam = cams[cams.length - 1];
    expect(cam.zoom).toBe(MIN_ZOOM);
    // Centred, so the fit shows the map rather than a corner of it.
    expect(cam.cx).toBeCloseTo(cam.mapMax / 2, 6);
    expect(cam.cy).toBeCloseTo(cam.mapMax / 2, 6);
  });

  it("zooms on the wheel and repaints at the new scale", () => {
    // The whole reason this component exists: the marks are redrawn for the new
    // camera instead of a fixed-resolution canvas being magnified.
    const { stage, cams } = mount();
    const before = cams.length;
    fireEvent.wheel(stage, { deltaY: -200, clientX: 300, clientY: 300 });
    expect(cams.length).toBeGreaterThan(before);
    expect(cams[cams.length - 1].zoom).toBeGreaterThan(MIN_ZOOM);
  });

  it("pans on a drag, and only while the pointer is down", () => {
    const { stage, cams } = mount();
    // Zoomed in first: at the fit the camera is clamped and cannot pan at all.
    fireEvent.wheel(stage, { deltaY: -400, clientX: 300, clientY: 300 });
    const start = cams[cams.length - 1];

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 200, clientY: 300 });
    const dragged = cams[cams.length - 1];
    expect(dragged.cx).not.toBeCloseTo(start.cx, 3);

    fireEvent.pointerUp(stage, { pointerId: 1 });
    const settled = cams.length;
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 100, clientY: 300 });
    expect(cams.length).toBe(settled);
  });

  it("ignores a move with no drag behind it", () => {
    // Every mouse move across the map with no button held comes through here,
    // so this is the common case rather than an edge one.
    //
    // Honest note on what this does NOT pin: dropping the `if (!v.drag)` guard
    // makes the handler throw on a null drag, and that is indistinguishable
    // here. The repaint count is unchanged either way, jsdom swallows the
    // throw out of a listener, and it reaches neither expect().toThrow nor a
    // console.error spy -- both were tried. The guard stays because a browser
    // would show the crash even though this cannot.
    const { stage, cams } = mount();
    const before = cams.length;
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 120, clientY: 340 });
    expect(cams.length).toBe(before);
  });

  it("steps in on a double-click, and back out to the fit on the next one", () => {
    const { stage, cams } = mount();
    fireEvent.doubleClick(stage, { clientX: 300, clientY: 300 });
    const stepped = cams[cams.length - 1].zoom;
    expect(stepped).toBeGreaterThan(MIN_ZOOM);

    fireEvent.doubleClick(stage, { clientX: 300, clientY: 300 });
    expect(cams[cams.length - 1].zoom).toBe(MIN_ZOOM);
  });

  it("does not take the end of a drag for a double-click", () => {
    const { stage, cams } = mount();
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 380, clientY: 300 });
    fireEvent.pointerUp(stage, { pointerId: 1 });
    const before = cams[cams.length - 1].zoom;
    fireEvent.doubleClick(stage, { clientX: 380, clientY: 300 });
    expect(cams[cams.length - 1].zoom).toBe(before);
  });

  it("repaints when the caller's paint changes", () => {
    // A new time range on the kill map is a new paint function, and the picture
    // has to follow it without any gesture.
    const first = vi.fn();
    const { rerender } = render(<MapStage rawMapName="Baltic_Main" paint={first} />);
    const second = vi.fn();
    rerender(<MapStage rawMapName="Baltic_Main" paint={second} />);
    expect(second).toHaveBeenCalled();
  });

  it("survives a caller that gives it no paint at all", () => {
    expect(() => render(<MapStage rawMapName="Baltic_Main" />)).not.toThrow();
  });

  it("survives a canvas with no 2D context", () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    const paint = vi.fn();
    expect(() => render(<MapStage rawMapName="Baltic_Main" paint={paint} />)).not.toThrow();
    expect(paint).not.toHaveBeenCalled();
  });
});
