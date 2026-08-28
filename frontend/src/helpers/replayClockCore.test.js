import { createClockCore } from "./replayClockCore";

test("advance moves t by dt * speed", () => {
  const c = createClockCore({ duration: 100 });
  c.setSpeed(2);
  c.play();
  c.advance(0);
  const r = c.advance(50);
  expect(r.t).toBeCloseTo(0.1, 6);
  expect(r.playing).toBe(true);
});

test("advance stops at duration", () => {
  const c = createClockCore({ duration: 10 });
  c.setSpeed(100);
  c.play();
  c.advance(0);
  const r = c.advance(1000);
  expect(r.t).toBe(10);
  expect(r.playing).toBe(false);
});

test("advance clamps a huge frame delta to 100 ms", () => {
  const c = createClockCore({ duration: 10000 });
  c.setSpeed(1);
  c.play();
  c.advance(0);
  const r = c.advance(60000);
  expect(r.t).toBeCloseTo(0.1, 6);
});

test("advance does nothing while paused", () => {
  const c = createClockCore({ duration: 100 });
  c.advance(0);
  expect(c.advance(1000).t).toBe(0);
});

test("play from the end restarts at 0", () => {
  const c = createClockCore({ duration: 10 });
  c.seek(10);
  c.play();
  expect(c.t).toBe(0);
});

test("seek clamps into range, pauses, and notifies listeners", () => {
  const c = createClockCore({ duration: 10 });
  const seen = [];
  c.onSeek((t) => seen.push(t));
  c.play();
  c.seek(-5);
  expect(c.t).toBe(0);
  c.seek(999);
  expect(c.t).toBe(10);
  expect(c.playing).toBe(false);
  expect(seen).toEqual([0, 10]);
});

test("offSeek removes a listener", () => {
  const c = createClockCore({ duration: 10 });
  const seen = [];
  const cb = (t) => seen.push(t);
  c.onSeek(cb);
  c.offSeek(cb);
  c.seek(3);
  expect(seen).toEqual([]);
});

test("shouldPublish throttles to the publish interval", () => {
  const c = createClockCore({ duration: 10, publishIntervalMs: 100 });
  expect(c.shouldPublish(0)).toBe(true);
  expect(c.shouldPublish(50)).toBe(false);
  expect(c.shouldPublish(101)).toBe(true);
});

test("toggle flips playing", () => {
  const c = createClockCore({ duration: 10 });
  c.toggle();
  expect(c.playing).toBe(true);
  c.toggle();
  expect(c.playing).toBe(false);
});
