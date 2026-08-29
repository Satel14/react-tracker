import { buildTracks, sampleTracks, STATE } from "./replayTracks";

const player = (over = {}) => ({
  name: "P", accountId: "a.p", teamId: 1, isFocal: false,
  positions: [{ t: 0, x: 0, y: 0 }, { t: 10, x: 100, y: 200 }],
  deathTime: null, dropTime: null, ...over,
});

test("lerps mid-segment", () => {
  const tracks = sampleTracks(buildTracks([player()]), 5);
  expect(tracks.outX[0]).toBeCloseTo(50, 4);
  expect(tracks.outY[0]).toBeCloseTo(100, 4);
  expect(tracks.outState[0]).toBe(STATE.ALIVE);
});

test("holds the first and last sample instead of vanishing", () => {
  const tracks = buildTracks([player()]);
  sampleTracks(tracks, -50);
  expect(tracks.outX[0]).toBe(0);
  expect(tracks.outState[0]).toBe(STATE.ALIVE);
  sampleTracks(tracks, 9999);
  expect(tracks.outX[0]).toBeCloseTo(100, 4);
});

test("marks a player dead after deathTime but keeps their last position", () => {
  const tracks = sampleTracks(buildTracks([player({ deathTime: 4 })]), 6);
  expect(tracks.outState[0]).toBe(STATE.DEAD);
  expect(tracks.outX[0]).toBeCloseTo(40, 4);
});

test("marks a player absent before dropTime", () => {
  const tracks = buildTracks([player({ dropTime: 5 })]);
  sampleTracks(tracks, 4);
  expect(tracks.outState[0]).toBe(STATE.ABSENT);
  sampleTracks(tracks, 5);
  expect(tracks.outState[0]).toBe(STATE.ALIVE);
});

test("a player with no samples is always absent", () => {
  const tracks = sampleTracks(buildTracks([player({ positions: [] })]), 5);
  expect(tracks.outState[0]).toBe(STATE.ABSENT);
});

test("lerps a long track at known checkpoints", () => {
  const positions = Array.from({ length: 20 }, (_, i) => ({ t: i * 10, x: i * 100, y: i * 50 }));
  const tracks = buildTracks([player({ positions })]);
  for (const [at, x, y] of [[0, 0, 0], [5, 50, 25], [95, 950, 475], [190, 1900, 950]]) {
    sampleTracks(tracks, at);
    expect(tracks.outX[0]).toBeCloseTo(x, 3);
    expect(tracks.outY[0]).toBeCloseTo(y, 3);
  }
});

test("allocates nothing per sample call", () => {
  const tracks = buildTracks([player(), player({ accountId: "a.q" })]);
  const x = tracks.outX;
  sampleTracks(tracks, 3);
  sampleTracks(tracks, 7);
  expect(tracks.outX).toBe(x);
});

// --- health and state flags carried alongside the position track ---------
// Both are discrete: health is a 10 s snapshot, and you are either in a vehicle
// or not. Interpolating either would invent readings the telemetry never made,
// so both step-hold the last sample at or before the requested time.

const rich = (over = {}) => ({
  name: "R", accountId: "a.r", teamId: 2, isFocal: false,
  positions: [
    { t: 0, x: 0, y: 0, h: 100, f: 0 },
    { t: 10, x: 100, y: 200, h: 50, f: 1 },
    { t: 20, x: 200, y: 400, h: 30, f: 3 },
  ],
  deathTime: null, dropTime: null, ...over,
});

test("carries health and flags off the decoded samples", () => {
  const tracks = buildTracks([rich()]);
  expect(Array.from(tracks.H[0])).toEqual([100, 50, 30]);
  expect(Array.from(tracks.F[0])).toEqual([0, 1, 3]);
});

test("defaults health to 100 and flags to 0 on a legacy track", () => {
  const tracks = sampleTracks(buildTracks([player()]), 5);
  expect(tracks.outH[0]).toBe(100);
  expect(tracks.outF[0]).toBe(0);
});

test("step-holds health instead of lerping it", () => {
  const tracks = buildTracks([rich()]);
  sampleTracks(tracks, 5);
  // Position is halfway between the samples, but health is not 75.
  expect(tracks.outX[0]).toBeCloseTo(50, 4);
  expect(tracks.outH[0]).toBe(100);
  sampleTracks(tracks, 10);
  expect(tracks.outH[0]).toBe(50);
  sampleTracks(tracks, 19);
  expect(tracks.outH[0]).toBe(50);
  sampleTracks(tracks, 20);
  expect(tracks.outH[0]).toBe(30);
});

test("step-holds the flag mask", () => {
  const tracks = buildTracks([rich()]);
  sampleTracks(tracks, 9);
  expect(tracks.outF[0]).toBe(0);
  sampleTracks(tracks, 11);
  expect(tracks.outF[0]).toBe(1);
  sampleTracks(tracks, 25);
  expect(tracks.outF[0]).toBe(3);
});

test("freezes health at deathTime like the position does", () => {
  const tracks = sampleTracks(buildTracks([rich({ deathTime: 12 })]), 30);
  expect(tracks.outState[0]).toBe(STATE.DEAD);
  expect(tracks.outH[0]).toBe(50);
});

test("clamps health and flags to the ends of the track", () => {
  const tracks = buildTracks([rich()]);
  sampleTracks(tracks, -50);
  expect(tracks.outH[0]).toBe(100);
  sampleTracks(tracks, 9999);
  expect(tracks.outH[0]).toBe(30);
  expect(tracks.outF[0]).toBe(3);
});

test("keeps health and flag buffers stable across sample calls", () => {
  const tracks = buildTracks([rich()]);
  const h = tracks.outH;
  sampleTracks(tracks, 3);
  sampleTracks(tracks, 15);
  expect(tracks.outH).toBe(h);
});

// --- movement heading -------------------------------------------------------
// Telemetry carries no facing angle, so a marker cannot show where a player is
// looking. It can show where they are GOING, from the track itself, which is
// what makes a map of sixty dots readable: you can see who is pushing where.

const walker = (positions, over = {}) => ({
  name: "W", accountId: "a.w", teamId: 1, isFocal: false,
  positions, deathTime: null, dropTime: null, ...over,
});

test("heading points along the segment the player is crossing", () => {
  const tracks = buildTracks([walker([
    { t: 0, x: 1000, y: 1000 },
    { t: 10, x: 1100, y: 1000 },   // due east
    { t: 20, x: 1100, y: 1100 },   // due south (world y grows downward)
  ])]);
  sampleTracks(tracks, 5);
  expect(tracks.outAngle[0]).toBeCloseTo(0, 4);
  expect(tracks.outMoving[0]).toBe(1);
  sampleTracks(tracks, 15);
  expect(tracks.outAngle[0]).toBeCloseTo(Math.PI / 2, 4);
});

test("a stationary player has no heading, rather than a stale one", () => {
  const tracks = buildTracks([walker([
    { t: 0, x: 1000, y: 1000 },
    { t: 10, x: 1100, y: 1000 },
    { t: 20, x: 1100, y: 1000 },   // stopped
  ])]);
  sampleTracks(tracks, 5);
  expect(tracks.outMoving[0]).toBe(1);
  const moving = tracks.outAngle[0];
  sampleTracks(tracks, 15);
  expect(tracks.outMoving[0]).toBe(0);
  // The angle is held rather than reset, so a marker that stops does not snap
  // to east; it just stops being drawn as an arrow.
  expect(tracks.outAngle[0]).toBeCloseTo(moving, 4);
});

test("heading holds at both ends of the track instead of vanishing", () => {
  const tracks = buildTracks([walker([
    { t: 10, x: 1000, y: 1000 },
    { t: 20, x: 1000, y: 900 },    // due north
  ])]);
  sampleTracks(tracks, 0);
  expect(tracks.outAngle[0]).toBeCloseTo(-Math.PI / 2, 4);
  sampleTracks(tracks, 999);
  expect(tracks.outAngle[0]).toBeCloseTo(-Math.PI / 2, 4);
});

test("a one-sample track is never treated as moving", () => {
  const tracks = sampleTracks(buildTracks([walker([{ t: 0, x: 1000, y: 1000 }])]), 5);
  expect(tracks.outMoving[0]).toBe(0);
});

test("heading buffers are typed and stable across calls", () => {
  const tracks = buildTracks([walker([{ t: 0, x: 0, y: 0 }, { t: 10, x: 50, y: 0 }])]);
  const a = tracks.outAngle;
  sampleTracks(tracks, 3);
  sampleTracks(tracks, 7);
  expect(tracks.outAngle).toBe(a);
});

test("a stopped player's heading does not depend on having played through", () => {
  // Everything else here is cursor-free so that scrubbing backwards gives the
  // same answer as playing forwards. A held angle that only existed if you had
  // already sampled the earlier segment would break exactly that.
  const stopped = [
    { t: 0, x: 1000, y: 1000 },
    { t: 10, x: 1000, y: 1200 },   // drove south
    { t: 20, x: 1000, y: 1200 },   // parked
    { t: 30, x: 1000, y: 1200 },
  ];
  const fresh = buildTracks([walker(stopped)]);
  sampleTracks(fresh, 25);          // first ever sample, mid-park
  expect(fresh.outMoving[0]).toBe(0);
  expect(fresh.outAngle[0]).toBeCloseTo(Math.PI / 2, 4);

  // And playing through to the same instant agrees.
  const played = buildTracks([walker(stopped)]);
  for (const t of [0, 5, 10, 15, 20, 25]) sampleTracks(played, t);
  expect(played.outAngle[0]).toBeCloseTo(fresh.outAngle[0], 6);
});

test("a player who never moves has no heading at all", () => {
  const tracks = sampleTracks(buildTracks([walker([
    { t: 0, x: 1000, y: 1000 },
    { t: 10, x: 1000, y: 1000 },
  ])]), 5);
  expect(tracks.outMoving[0]).toBe(0);
  expect(tracks.outAngle[0]).toBe(0);
});
