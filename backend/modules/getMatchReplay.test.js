const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseReplayTelemetry } = require("./getMatchReplay");

const matchAttributes = { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" };

const telemetry = [
  { _T: "LogMatchStart", characters: [
    { character: { accountId: "account.me", name: "Me", teamId: 1 } },
    { character: { accountId: "account.mate", name: "Mate", teamId: 1 } },
    { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
  ] },
  { _T: "LogPlayerPosition", common: { isGame: 0 }, elapsedTime: 0, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 100000, y: 100000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 400000, y: 400000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 20, character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 500000, y: 500000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.mate", name: "Mate", teamId: 1, location: { x: 405000, y: 405000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 410000, y: 410000, z: 0 } } },
  { _T: "LogPlayerKillV2", elapsedTime: 15, killer: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 450000, y: 450000, z: 0 } }, victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 460000, y: 460000, z: 0 } } },
  { _T: "LogGameStatePeriodic", elapsedTime: 0, gameState: { safetyZonePosition: { x: 400000, y: 400000, z: 0 }, safetyZoneRadius: 0, poisonGasWarningPosition: { x: 400000, y: 400000, z: 0 }, poisonGasWarningRadius: 0 } },
  { _T: "LogGameStatePeriodic", elapsedTime: 10, gameState: { safetyZonePosition: { x: 400000, y: 400000, z: 0 }, safetyZoneRadius: 300000, poisonGasWarningPosition: { x: 420000, y: 420000, z: 0 }, poisonGasWarningRadius: 200000 } },
  { _T: "LogGameStatePeriodic", elapsedTime: 20, gameState: { safetyZonePosition: { x: 410000, y: 410000, z: 0 }, safetyZoneRadius: 250000, poisonGasWarningPosition: { x: 420000, y: 420000, z: 0 }, poisonGasWarningRadius: 200000 } },
];

test("groups positions per player, sorted by t, dropping lobby (isGame<0.1)", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  const me = r.players.find((p) => p.accountId === "account.me");
  assert.deepEqual(me.positions.map((p) => p.t), [10, 20]); // the isGame:0 sample at t=0 dropped
  assert.equal(me.positions[0].x, 4000); // 400000/100
});

test("extracts kills with scaled locations and sets victim deathTime", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.kills.length, 1);
  assert.equal(r.kills[0].killer, "Me");
  assert.equal(r.kills[0].vx, 4600);
  const foe = r.players.find((p) => p.accountId === "account.foe");
  assert.equal(foe.deathTime, 15);
});

test("marks focal player and teammates via isFocal", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.players.find((p) => p.accountId === "account.me").isFocal, true);
  assert.equal(r.players.find((p) => p.accountId === "account.foe").isFocal, false);
  assert.equal(r.players.find((p) => p.accountId === "account.mate").isFocal, true);
  assert.equal(r.mapMax, 8160);
  assert.equal(r.mapName, "Erangel");
});

test("parses LogGameStatePeriodic into a zones timeline, skipping pre-game zero-radius samples", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.zones.length, 2); // the radius-0 t=0 sample is skipped
  assert.deepEqual(r.zones.map((z) => z.t), [10, 20]);
  assert.equal(r.zones[0].bx, 4000); // 400000 / 100
  assert.equal(r.zones[0].br, 3000); // 300000 / 100
  assert.equal(r.zones[0].wx, 4200);
  assert.equal(r.zones[0].wr, 2000);
  assert.equal(r.zones[1].bx, 4100); // 410000 / 100
  assert.equal(r.zones[1].by, 4100); // 410000 / 100
  assert.equal(r.zones[1].br, 2500); // 250000 / 100
  assert.equal(r.zones[1].wr, 2000); // 200000 / 100
});

test("kills carry killer and victim identity, not just names", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.kills[0].killerAccountId, "account.me");
  assert.equal(r.kills[0].victimAccountId, "account.foe");
  assert.equal(r.kills[0].killerTeamId, 1);
  assert.equal(r.kills[0].victimTeamId, 2);
});

test("echoes the resolved focal identity and the roster totals", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.equal(r.focalAccountId, "account.me");
  assert.equal(r.focalTeamId, 1);
  assert.equal(r.totalPlayers, 3);
  assert.equal(r.totalTeams, 2);
});

test("reports a missing focal player instead of silently marking everyone an enemy", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, playerName: "SomeoneElse" });
  assert.equal(r.focalAccountId, null);
  assert.equal(r.focalTeamId, null);
  assert.equal(r.players.every((p) => p.isFocal === false), true);
});

test("keeps roster players who emitted no position samples", () => {
  const trimmed = telemetry.filter((ev) => !(ev._T === "LogPlayerPosition" && ev.character.accountId === "account.mate"));
  const r = parseReplayTelemetry(trimmed, { matchAttributes, accountId: "account.me" });
  const mate = r.players.find((p) => p.accountId === "account.mate");
  assert.ok(mate, "roster-only player must still appear");
  assert.deepEqual(mate.positions, []);
});

test("keeps a kill whose killer location is unreadable", () => {
  const withBlueZoneDeath = [...telemetry, {
    _T: "LogPlayerKillV2", elapsedTime: 40,
    killer: null, finisher: null,
    victim: { accountId: "account.mate", name: "Mate", teamId: 1, location: { x: 700000, y: 700000, z: 0 } },
  }];
  const r = parseReplayTelemetry(withBlueZoneDeath, { matchAttributes, accountId: "account.me" });
  const death = r.kills.find((k) => k.victimAccountId === "account.mate");
  assert.ok(death, "a killerless death must still be recorded");
  assert.equal(death.kx, null);
  assert.equal(death.vx, 7000);
  assert.equal(r.players.find((p) => p.accountId === "account.mate").deathTime, 40);
});

test("dedupes duplicate position samples at the same t", () => {
  const dup = telemetry.find((ev) => ev._T === "LogPlayerPosition" && ev.elapsedTime === 10 && ev.character.accountId === "account.me");
  const r = parseReplayTelemetry([...telemetry, { ...dup }], { matchAttributes, accountId: "account.me" });
  const me = r.players.find((p) => p.accountId === "account.me");
  assert.deepEqual(me.positions.map((p) => p.t), [10, 20]);
});
