const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapPubgStatsToFrontend } = require("./statsMapper");

test("default profile exposes a stable shape including weaponMastery", () => {
  const { data } = mapPubgStatsToFrontend({ gameModeStats: {} }, "Tester", "account.1");
  assert.equal(data.profile.status, "not_loaded");
  assert.equal(data.profile.banType, null);
  assert.equal(data.profile.clan, null);
  assert.equal(data.profile.survivalMastery, null);
  assert.ok("weaponMastery" in data.profile);
  assert.equal(data.profile.weaponMastery, null);
});

test("provided profileExtras override the default profile", () => {
  const { data } = mapPubgStatsToFrontend(
    { gameModeStats: {} },
    "Tester",
    "account.1",
    null,
    null,
    null,
    null,
    "steam",
    null,
    { profile: { status: "ok", weaponMastery: { total: 3 } }, matches: { summary: { total: 0 }, items: [] } }
  );
  assert.equal(data.profile.status, "ok");
  assert.deepEqual(data.profile.weaponMastery, { total: 3 });
});
