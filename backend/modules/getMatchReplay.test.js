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
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 410000, y: 410000, z: 0 } } },
  { _T: "LogPlayerKillV2", elapsedTime: 15, killer: { accountId: "account.me", name: "Me", location: { x: 450000, y: 450000, z: 0 } }, victim: { accountId: "account.foe", name: "Foe", location: { x: 460000, y: 460000, z: 0 } } },
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
  assert.equal(r.mapMax, 8160);
  assert.equal(r.mapName, "Erangel");
});
