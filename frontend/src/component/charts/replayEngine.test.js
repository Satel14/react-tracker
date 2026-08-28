import { advanceClock, zoneAt, rosterAt, groupRosterIntoTeams } from "./replayEngine";

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
    { t: 3, killer: "Twin", killerAccountId: "a.2", victim: "Z" },
  ];
  const byId = new Map();
  for (const row of rosterAt(players, kills, 10)) byId.set(row.accountId, row.kills);
  expect(byId.get("a.1")).toBe(2);
  expect(byId.get("a.2")).toBe(1);
});

test("rosterAt does not credit anyone for a killerless death and does not throw", () => {
  const players = [
    { name: "Me", accountId: "a.me", teamId: 1, isFocal: true, positions: [], deathTime: 5 },
  ];
  const kills = [
    { t: 5, killer: null, killerAccountId: null, victim: "Me", victimAccountId: "a.me" },
  ];
  let rows;
  expect(() => { rows = rosterAt(players, kills, 10); }).not.toThrow();
  expect(rows[0].kills).toBe(0);
});

const hpPlayers = () => [
  {
    name: "Me",
    accountId: "a.me",
    teamId: 1,
    isFocal: true,
    deathTime: null,
    positions: [
      { t: 0, x: 0, y: 0, h: 100, f: 0 },
      { t: 10, x: 0, y: 0, h: 40, f: 0 },
      { t: 20, x: 0, y: 0, h: 10, f: 2 },
    ],
  },
];

test("rosterAt step-holds health from the last sample at or before t", () => {
  const players = hpPlayers();
  expect(rosterAt(players, [], 0)[0].h).toBe(100);
  expect(rosterAt(players, [], 9)[0].h).toBe(100);   // never interpolated
  expect(rosterAt(players, [], 9.999)[0].h).toBe(100);
  expect(rosterAt(players, [], 10)[0].h).toBe(40);
  expect(rosterAt(players, [], 19)[0].h).toBe(40);
  expect(rosterAt(players, [], 20)[0].h).toBe(10);
  expect(rosterAt(players, [], 999)[0].h).toBe(10);  // held past the last sample
});

test("rosterAt reports full health before the first sample and with no samples at all", () => {
  const [me] = hpPlayers();
  const late = { ...me, positions: me.positions.map((p) => ({ ...p, t: p.t + 30 })) };
  expect(rosterAt([late], [], 0)[0].h).toBe(100);
  expect(rosterAt([{ ...me, positions: [] }], [], 50)[0].h).toBe(100);
  expect(rosterAt([{ ...me, positions: undefined }], [], 50)[0].h).toBe(100);
});

test("rosterAt defaults health to 100 and flags to 0 on a legacy sample missing h/f", () => {
  const players = [
    { name: "Old", accountId: "a.old", teamId: 1, isFocal: false, deathTime: null,
      positions: [{ t: 0, x: 1, y: 2 }] },
  ];
  const row = rosterAt(players, [], 5)[0];
  expect(row.h).toBe(100);
  expect(row.knocked).toBe(false);
});

test("rosterAt reads knocked from bit 2 only, ignoring the vehicle bit", () => {
  const mask = (f) => rosterAt(
    [{ name: "P", accountId: "a.p", teamId: 1, isFocal: false, deathTime: null,
       positions: [{ t: 0, x: 0, y: 0, h: 50, f }] }],
    [],
    5
  )[0].knocked;
  expect(mask(0)).toBe(false);
  expect(mask(1)).toBe(false); // in a vehicle, not knocked
  expect(mask(2)).toBe(true);
  expect(mask(3)).toBe(true);  // in a vehicle AND knocked
});

test("rosterAt never reports a dead player as knocked", () => {
  const players = [
    { name: "Gone", accountId: "a.gone", teamId: 1, isFocal: false, deathTime: 5,
      positions: [{ t: 0, x: 0, y: 0, h: 20, f: 2 }] },
  ];
  const still = rosterAt(players, [], 5)[0];
  expect(still.alive).toBe(true);
  expect(still.knocked).toBe(true);
  const dead = rosterAt(players, [], 6)[0];
  expect(dead.alive).toBe(false);
  expect(dead.knocked).toBe(false);
});

test("rosterAt finds the held sample anywhere in a long track, scrubbing both ways", () => {
  const positions = [];
  for (let i = 0; i < 64; i += 1) positions.push({ t: i * 10, x: 0, y: 0, h: 100 - i, f: i === 40 ? 2 : 0 });
  const players = [{ name: "Long", accountId: "a.long", teamId: 1, isFocal: false, deathTime: null, positions }];
  for (const i of [63, 0, 40, 7, 62, 1]) {
    const row = rosterAt(players, [], i * 10 + 9)[0];
    expect(row.h).toBe(100 - i);
    expect(row.knocked).toBe(i === 40);
  }
});

test("groupRosterIntoTeams puts the focal team first, then survivors, then team id", () => {
  const rows = [
    { name: "A", accountId: "a.1", teamId: 9, alive: true, kills: 0, isFocal: false, h: 100, knocked: false },
    { name: "B", accountId: "a.2", teamId: 3, alive: false, kills: 0, isFocal: false, h: 0, knocked: false },
    { name: "C", accountId: "a.3", teamId: 7, alive: true, kills: 0, isFocal: true, h: 100, knocked: false },
    { name: "D", accountId: "a.4", teamId: 2, alive: false, kills: 0, isFocal: false, h: 0, knocked: false },
  ];
  expect(groupRosterIntoTeams(rows).map((team) => team.teamId)).toEqual([7, 9, 2, 3]);
});

test("groupRosterIntoTeams counts survivors and sorts members alive-first, then kills, then name", () => {
  const rows = [
    { name: "Zoe", accountId: "a.1", teamId: 4, alive: true, kills: 1, isFocal: false, h: 100, knocked: false },
    { name: "Abe", accountId: "a.2", teamId: 4, alive: false, kills: 9, isFocal: false, h: 0, knocked: false },
    { name: "Cid", accountId: "a.3", teamId: 4, alive: true, kills: 3, isFocal: false, h: 55, knocked: true },
    { name: "Ann", accountId: "a.4", teamId: 4, alive: true, kills: 1, isFocal: false, h: 80, knocked: false },
  ];
  const [team] = groupRosterIntoTeams(rows);
  expect(team.total).toBe(4);
  expect(team.aliveCount).toBe(3); // a knocked player still counts as alive
  expect(team.members.map((m) => m.name)).toEqual(["Cid", "Ann", "Zoe", "Abe"]);
});

test("groupRosterIntoTeams keeps teamless rows in one bucket, sorted last", () => {
  const rows = [
    { name: "Solo", accountId: "a.1", teamId: null, alive: true, kills: 0, isFocal: false, h: 100, knocked: false },
    { name: "Duo", accountId: "a.2", teamId: 5, alive: true, kills: 0, isFocal: false, h: 100, knocked: false },
  ];
  const teams = groupRosterIntoTeams(rows);
  expect(teams.map((team) => team.teamId)).toEqual([5, null]);
  expect(teams[1].members).toHaveLength(1);
});
