import { buildTracks, sampleTracks, STATE } from "./replayTracks";
import { interpolatePosition } from "../component/charts/replayEngine";

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

test("matches interpolatePosition inside the sampled range over a random walk", () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const positions = [];
  let t = 0;
  for (let i = 0; i < 180; i += 1) {
    positions.push({ t, x: Math.round(rand() * 8160), y: Math.round(rand() * 8160) });
    t += 10;
  }
  const tracks = buildTracks([player({ positions })]);
  const last = positions[positions.length - 1].t;
  let checked = 0;
  for (let i = 0; i < 10000; i += 1) {
    // Deliberately non-monotonic: forward jumps and backward seeks.
    const at = Math.round(rand() * last * 100) / 100;
    sampleTracks(tracks, at);
    const ref = interpolatePosition(positions, at);
    expect(tracks.outX[0]).toBeCloseTo(ref.x, 2);
    expect(tracks.outY[0]).toBeCloseTo(ref.y, 2);
    checked += 1;
  }
  expect(checked).toBe(10000);
});

test("allocates nothing per sample call", () => {
  const tracks = buildTracks([player(), player({ accountId: "a.q" })]);
  const x = tracks.outX;
  sampleTracks(tracks, 3);
  sampleTracks(tracks, 7);
  expect(tracks.outX).toBe(x);
});
