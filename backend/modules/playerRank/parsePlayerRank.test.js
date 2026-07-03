const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shouldReenrich, createProfileExtrasError } = require("./parsePlayerRank");

test("shouldReenrich short-circuits only for an 'ok' profile", () => {
  assert.equal(shouldReenrich({ status: "ok" }), false);
  assert.equal(shouldReenrich({ status: "partial" }), true);
  assert.equal(shouldReenrich({ status: "error" }), true);
  assert.equal(shouldReenrich({ status: "not_loaded" }), true);
});

test("shouldReenrich re-enriches when the profile is null or has no status", () => {
  assert.equal(shouldReenrich(null), true);
  assert.equal(shouldReenrich(undefined), true);
  assert.equal(shouldReenrich({}), true);
});

test("createProfileExtrasError returns a stable error profile including weaponMastery", () => {
  const extras = createProfileExtrasError(new Error("boom"));
  assert.equal(extras.profile.status, "error");
  assert.equal(extras.profile.error, "boom");
  assert.equal(extras.profile.banType, null);
  assert.equal(extras.profile.clan, null);
  assert.equal(extras.profile.survivalMastery, null);
  assert.ok("weaponMastery" in extras.profile);
  assert.equal(extras.profile.weaponMastery, null);
  assert.equal(extras.matches.summary.total, 0);
  assert.deepEqual(extras.matches.items, []);
});

test("createProfileExtrasError carries fallback fields when a prior profile exists", () => {
  const extras = createProfileExtrasError(new Error("x"), {
    banType: "TemporaryBan",
    clan: { id: "clan.1" },
    survivalMastery: { level: 5 },
    weaponMastery: { total: 9 },
  });
  assert.equal(extras.profile.banType, "TemporaryBan");
  assert.deepEqual(extras.profile.clan, { id: "clan.1" });
  assert.deepEqual(extras.profile.survivalMastery, { level: 5 });
  assert.deepEqual(extras.profile.weaponMastery, { total: 9 });
});
