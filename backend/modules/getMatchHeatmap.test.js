const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractHeatmapEvents } = require("./getMatchHeatmap");

// Focal player is identified via the killer/victim OBJECTS (no dmgInfo fallback needed here).
const telemetry = [
  { _T: "LogParachuteLanding", elapsedTime: 60,
    character: { accountId: "account.me", name: "Me", location: { x: 300000, y: 400000, z: 0 } } },
  { _T: "LogPlayerKillV2", elapsedTime: 120,
    killer: { accountId: "account.me", name: "Me", location: { x: 500000, y: 500000, z: 0 } },
    victim: { accountId: "account.foe", name: "Foe", location: { x: 510000, y: 520000, z: 0 } },
    killerDamageInfo: { damageCauserName: "WeapHK416_C", distance: 5000 } },
  { _T: "LogPlayerKillV2", elapsedTime: 180,
    killer: { accountId: "account.foe", name: "Foe", location: { x: 620000, y: 630000, z: 0 } },
    victim: { accountId: "account.me", name: "Me", location: { x: 600000, y: 700000, z: 0 } },
    killerDamageInfo: { damageCauserName: "WeapKar98k_C", distance: 12000 } },
  // unrelated kill between two other players — must be ignored
  { _T: "LogPlayerKillV2", elapsedTime: 200,
    killer: { accountId: "account.x", name: "X", location: { x: 1, y: 1, z: 0 } },
    victim: { accountId: "account.y", name: "Y", location: { x: 2, y: 2, z: 0 } } },
];

test("extractHeatmapEvents captures the focal player's landing as a drop point", () => {
  const events = extractHeatmapEvents(telemetry, { matchStartMs: 0, accountId: "account.me" });
  const drop = events.find((e) => e.type === "drop");
  assert.ok(drop);
  assert.equal(drop.x, 3000); // 300000 / 100
  assert.equal(drop.y, 4000);
  assert.equal(drop.time, 60); // from elapsedTime via telemetryUtils.eventTime
});

test("extractHeatmapEvents records a kill at the victim location with weapon + metre distance", () => {
  const events = extractHeatmapEvents(telemetry, { matchStartMs: 0, accountId: "account.me" });
  const kill = events.find((e) => e.type === "kill");
  assert.ok(kill);
  assert.equal(kill.x, 5100); // victim 510000 / 100
  assert.equal(kill.y, 5200);
  assert.equal(kill.victim, "Foe");
  assert.equal(kill.weapon, "WeapHK416_C");
  assert.equal(kill.distance, 50); // 5000 cm -> 50 m
});

test("extractHeatmapEvents records a death at the focal player's location", () => {
  const events = extractHeatmapEvents(telemetry, { matchStartMs: 0, accountId: "account.me" });
  const death = events.find((e) => e.type === "death");
  assert.ok(death);
  assert.equal(death.x, 6000); // focal victim 600000 / 100
  assert.equal(death.y, 7000);
  assert.equal(death.killer, "Foe");
  assert.equal(death.distance, 120); // 12000 cm -> 120 m
});

test("extractHeatmapEvents ignores kills that do not involve the focal player", () => {
  const events = extractHeatmapEvents(telemetry, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(events.length, 3); // drop + 1 kill + 1 death only
});

// --- dmgInfo killer fallback (killer object absent) ---
const fallbackTelemetry = [
  // focal is the VICTIM; killer object absent, only dmgInfo.killerName present
  { _T: "LogPlayerKillV2", elapsedTime: 90,
    killer: null, dmgInfo: { killerName: "Sniper" },
    victim: { accountId: "account.me", name: "Me", location: { x: 600000, y: 700000, z: 0 } },
    killerDamageInfo: { damageCauserName: "WeapKar98k_C", distance: 12000 } },
  // focal is the KILLER by name only; killer object absent, dmgInfo.killerName == focal name
  { _T: "LogPlayerKillV2", elapsedTime: 110,
    killer: null, dmgInfo: { killerName: "Me" },
    victim: { accountId: "account.enemy", name: "Enemy", location: { x: 800000, y: 900000, z: 0 } },
    killerDamageInfo: { damageCauserName: "WeapMk14_C", distance: 3000 } },
];

test("extractHeatmapEvents resolves the killer name from dmgInfo when the killer object is absent (death)", () => {
  const events = extractHeatmapEvents(fallbackTelemetry, { matchStartMs: 0, accountId: "account.me", playerName: "Me" });
  const death = events.find((e) => e.type === "death");
  assert.ok(death, "a death event should be produced when focal is the victim");
  assert.equal(death.killer, "Sniper"); // fallback now resolves instead of null
  assert.equal(death.x, 6000);
});

test("extractHeatmapEvents classifies a kill when the focal player is only named in dmgInfo", () => {
  const events = extractHeatmapEvents(fallbackTelemetry, { matchStartMs: 0, accountId: "account.me", playerName: "Me" });
  const kill = events.find((e) => e.type === "kill");
  assert.ok(kill, "a kill event should be produced when dmgInfo.killerName matches the focal name");
  assert.equal(kill.victim, "Enemy");
  assert.equal(kill.distance, 30); // 3000 cm -> 30 m
});

// --- batch warming respects the rate-limit cooldown ---
const { warmHeatmapMatches } = require("./getMatchHeatmap");

test("warmHeatmapMatches builds each match id in order until rate-limited", async () => {
  const calls = [];
  let limited = false;
  await warmHeatmapMatches(
    { shard: "steam", matchIds: ["m1", "m2", "m3", "m4"], accountId: "account.me" },
    {
      buildOne: async ({ matchId }) => { calls.push(matchId); if (matchId === "m2") limited = true; },
      isRateLimited: () => limited,
    }
  );
  assert.deepEqual(calls, ["m1", "m2"]); // m3/m4 skipped once the cooldown trips
});

test("warmHeatmapMatches swallows per-match build errors and keeps going", async () => {
  const calls = [];
  await warmHeatmapMatches(
    { shard: "steam", matchIds: ["m1", "m2"], accountId: "account.me" },
    {
      buildOne: async ({ matchId }) => { calls.push(matchId); throw new Error("build failed"); },
      isRateLimited: () => false,
    }
  );
  assert.deepEqual(calls, ["m1", "m2"]);
});

test("warmHeatmapMatches caps the batch at 12 matches", async () => {
  const calls = [];
  const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);
  await warmHeatmapMatches(
    { shard: "steam", matchIds: ids, accountId: "account.me" },
    { buildOne: async ({ matchId }) => { calls.push(matchId); }, isRateLimited: () => false }
  );
  assert.equal(calls.length, 12);
});
