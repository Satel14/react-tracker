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
