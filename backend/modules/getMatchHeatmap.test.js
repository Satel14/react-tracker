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
