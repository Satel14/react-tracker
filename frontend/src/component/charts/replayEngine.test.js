import { interpolatePosition, playersAt, activeKills, advanceClock } from "./replayEngine";

const positions = [{ t: 0, x: 0, y: 0 }, { t: 10, x: 100, y: 200 }];

test("interpolatePosition lerps mid-segment", () => {
  expect(interpolatePosition(positions, 5)).toEqual({ x: 50, y: 100 });
});

test("interpolatePosition returns null out of range", () => {
  expect(interpolatePosition(positions, -1)).toBeNull();
  expect(interpolatePosition(positions, 11)).toBeNull();
});

test("playersAt hides dead players and interpolates the living", () => {
  const players = [
    { name: "A", teamId: 1, isFocal: true, positions, deathTime: null },
    { name: "B", teamId: 2, isFocal: false, positions, deathTime: 4 },
  ];
  const at5 = playersAt(players, 5);
  expect(at5).toHaveLength(1);
  expect(at5[0].name).toBe("A");
  expect(at5[0].x).toBe(50);
});

test("activeKills includes only in-window kills with age 0..1", () => {
  const kills = [{ t: 2, kx: 1, ky: 1, vx: 2, vy: 2 }, { t: 20, kx: 0, ky: 0, vx: 0, vy: 0 }];
  const a = activeKills(kills, 3, 3);
  expect(a).toHaveLength(1);
  expect(a[0].age).toBeCloseTo(1 / 3, 5);
});

test("advanceClock advances by dt*speed and stops at duration", () => {
  expect(advanceClock(0, 1000, 2, 100)).toEqual({ t: 2, playing: true });
  expect(advanceClock(99, 1000, 5, 100)).toEqual({ t: 100, playing: false });
});
