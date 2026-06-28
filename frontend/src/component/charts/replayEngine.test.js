import { interpolatePosition, playersAt, activeKills, advanceClock, zoneAt, rosterAt } from "./replayEngine";

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

const zones = [
  { t: 0, bx: 0, by: 0, br: 1000, wx: 0, wy: 0, wr: 500 },
  { t: 10, bx: 100, by: 200, br: 800, wx: 50, wy: 50, wr: 500 },
];

test("zoneAt lerps fields mid-segment", () => {
  const z = zoneAt(zones, 5);
  expect(z.bx).toBe(50);
  expect(z.by).toBe(100);
  expect(z.br).toBe(900);
});

test("zoneAt clamps to edges and is null on empty", () => {
  expect(zoneAt(zones, -5).br).toBe(1000);
  expect(zoneAt(zones, 99).br).toBe(800);
  expect(zoneAt([], 5)).toBeNull();
});

test("rosterAt counts kills up to t, marks alive/dead, sorts focal-first", () => {
  const players = [
    { name: "Me", accountId: "a.me", teamId: 1, isFocal: true, positions: [], deathTime: null },
    { name: "Foe", accountId: "a.foe", teamId: 2, isFocal: false, positions: [], deathTime: 15 },
  ];
  const kills = [
    { t: 5, killer: "Me", victim: "X" },
    { t: 30, killer: "Me", victim: "Y" },
    { t: 8, killer: "Foe", victim: "Z" },
  ];
  const rows = rosterAt(players, kills, 20);
  expect(rows[0].name).toBe("Me"); // focal first
  expect(rows[0].kills).toBe(1);   // only the t=5 kill counts at t=20 (t=30 excluded)
  expect(rows[1].name).toBe("Foe");
  expect(rows[1].alive).toBe(false); // died at 15, t=20
});

test("playersAt includes accountId", () => {
  const players = [{ name: "Me", accountId: "a.me", teamId: 1, isFocal: true, positions: [{ t: 0, x: 1, y: 2 }], deathTime: null }];
  expect(playersAt(players, 0)[0].accountId).toBe("a.me");
});
