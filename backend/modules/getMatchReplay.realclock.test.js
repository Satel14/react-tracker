const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseReplayTelemetry } = require("./getMatchReplay");

// createdAt precedes the in-game clock origin by 7 s, exactly the drift the
// shipped code silently inherited.
const matchAttributes = { mapName: "Baltic_Main", duration: 120, createdAt: "2026-01-01T00:00:00.000Z" };
const wall = (elapsed) => new Date(Date.UTC(2026, 0, 1, 0, 0, elapsed + 7)).toISOString();

const telemetry = [
  { _T: "LogMatchStart", _D: wall(0), characters: [
    { character: { accountId: "account.me", name: "Me", teamId: 1 } },
    { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
  ] },
  ...[10, 20, 30, 40].flatMap((t) => ([
    { _T: "LogPlayerPosition", _D: wall(t), common: { isGame: 1 }, elapsedTime: t,
      character: { accountId: "account.me", name: "Me", teamId: 1, location: { x: t * 10000, y: 100000, z: 0 } } },
    { _T: "LogPlayerPosition", _D: wall(t), common: { isGame: 1 }, elapsedTime: t,
      character: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 200000, y: 200000, z: 0 } } },
  ])),
  { _T: "LogPlayerKillV2", _D: wall(30),
    killer: { accountId: "account.me", name: "Me", teamId: 1, location: { x: 300000, y: 100000, z: 0 } },
    victim: { accountId: "account.foe", name: "Foe", teamId: 2, location: { x: 200000, y: 200000, z: 0 } } },
  { _T: "LogGameStatePeriodic", _D: wall(20), gameState: { elapsedTime: 20,
    safetyZonePosition: { x: 400000, y: 400000, z: 0 }, safetyZoneRadius: 300000,
    poisonGasWarningPosition: { x: 420000, y: 420000, z: 0 }, poisonGasWarningRadius: 200000 } },
];

test("a kill carrying only _D lands on the same clock as the positions", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.deepEqual(
    r.players.find((p) => p.accountId === "account.me").positions.map((p) => p.t),
    [10, 20, 30, 40]
  );
  assert.equal(r.kills[0].t, 30);
  assert.equal(r.players.find((p) => p.accountId === "account.foe").deathTime, 30);
});

test("a gamestate sample uses gameState.elapsedTime, not the wall clock", () => {
  const r = parseReplayTelemetry(telemetry, { matchAttributes, accountId: "account.me" });
  assert.deepEqual(r.zones.map((z) => z.t), [20]);
});
