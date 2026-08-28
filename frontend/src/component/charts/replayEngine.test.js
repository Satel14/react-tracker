import { advanceClock, zoneAt, rosterAt } from "./replayEngine";

test("advanceClock advances by dt*speed and stops at duration", () => {
  expect(advanceClock(0, 1000, 2, 100)).toEqual({ t: 2, playing: true });
  expect(advanceClock(99, 1000, 5, 100)).toEqual({ t: 100, playing: false });
});

const zones = [
  { t: 0, bx: 0, by: 0, br: 1000, wx: 0, wy: 0, wr: 500, phase: 1 },
  { t: 10, bx: 100, by: 200, br: 800, wx: 50, wy: 50, wr: 500, phase: 2 },
];

test("zoneAt lerps fields mid-segment", () => {
  const z = zoneAt(zones, 5);
  expect(z.bx).toBe(50);
  expect(z.by).toBe(100);
  expect(z.br).toBe(900);
});

test("zoneAt has no circle before the first sample, clamps at the end, and is null on empty", () => {
  expect(zoneAt(zones, -5)).toBeNull();
  expect(zoneAt(zones, 99).br).toBe(800);
  expect(zoneAt([], 5)).toBeNull();
});

test("zoneAt steps the warning circle and lerps the blue one", () => {
  const z = zoneAt(zones, 5);
  expect(z.br).toBe(900);      // blue lerps
  expect(z.wx).toBe(0);        // warning held from the left sample
  expect(z.wy).toBe(0);
  expect(z.wr).toBe(500);
  expect(z.phase).toBe(1);
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

test("rosterAt credits kills for players with Object.prototype names", () => {
  const players = [
    { name: "constructor", accountId: "a.1", teamId: 1, isFocal: false, positions: [], deathTime: null },
    { name: "__proto__", accountId: "a.2", teamId: 1, isFocal: false, positions: [], deathTime: null },
    { name: "toString", accountId: "a.3", teamId: 1, isFocal: false, positions: [], deathTime: null },
  ];
  const kills = [
    { t: 1, killer: "constructor", victim: "X" },
    { t: 2, killer: "__proto__", victim: "Y" },
  ];
  const byName = new Map();
  for (const row of rosterAt(players, kills, 10)) byName.set(row.name, row.kills);
  expect(byName.get("constructor")).toBe(1);
  expect(byName.get("__proto__")).toBe(1);
  expect(byName.get("toString")).toBe(0);
});

test("rosterAt credits two players sharing a display name separately", () => {
  const players = [
    { name: "Twin", accountId: "a.1", teamId: 1, isFocal: false, positions: [], deathTime: null },
    { name: "Twin", accountId: "a.2", teamId: 2, isFocal: false, positions: [], deathTime: null },
  ];
  const kills = [
    { t: 1, killer: "Twin", killerAccountId: "a.1", victim: "X" },
    { t: 2, killer: "Twin", killerAccountId: "a.1", victim: "Y" },
  ];
  const byId = new Map();
  for (const row of rosterAt(players, kills, 10)) byId.set(row.accountId, row.kills);
  expect(byId.get("a.1")).toBe(2);
  expect(byId.get("a.2")).toBe(0);
});
