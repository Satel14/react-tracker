const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { shouldReenrich, createProfileExtrasError, createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function stub404() {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };
  return calls;
}

const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

test("a malformed account.* handle is treated as a name, never interpolated raw into /players/<id>", async () => {
  const calls = stub404();
  await assert.rejects(parse("steam", "account.evil/../../secret", {}));
  assert.match(calls[0], /\/players\?filter\[playerNames\]=/);
  assert.ok(!calls[0].includes("/players/account.evil"));
  assert.ok(calls[0].includes(encodeURIComponent("account.evil/../../secret")));
});

test("a strict account.<32hex> id still takes the account-id branch (profile lookup by id)", async () => {
  const calls = stub404();
  const strictId = "account." + "a".repeat(32);
  await assert.rejects(parse("steam", strictId, {}));
  assert.equal(calls[0], `https://api.pubg.com/shards/steam/players/${strictId}`);
});

test("shouldReenrich short-circuits for 'ok' and 'deferred' profiles only", () => {
  assert.equal(shouldReenrich({ status: "ok" }), false);
  assert.equal(shouldReenrich({ status: "deferred" }), false);
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
