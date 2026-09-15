const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../controllers/player");
const { getPlayerReports } = require("../modules/getPlayerReports");

const accountId = "account." + "a".repeat(32);
const encounter = { MatchID: "match-1", AttackID: 1, Killer: "Neo", Victim: "Trinity", TimeEvent: "2026-09-15T12:00:00Z" };

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test("reports reject an account-only request with an error body before contacting upstream", async (t) => {
  const upstream = t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => [encounter] }));
  for (const playerName of [undefined, "   "]) {
    const res = makeRes();
    await controller.getPlayerReports({ body: { accountId, playerName } }, res);
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 422);
    assert.equal(typeof res.body.message, "string");
    assert.equal(res.body.data, undefined);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("the reports module rejects a missing name instead of filtering every upstream encounter out", async (t) => {
  const upstream = t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => [encounter] }));
  await assert.rejects(getPlayerReports({ accountId }), /playerName is required/);
  await assert.rejects(getPlayerReports({ accountId, playerName: "   " }), /playerName is required/);
  assert.equal(upstream.mock.callCount(), 0);
});

test("reports with a player name still return classified encounters in the controller body", async (t) => {
  const upstream = t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => [encounter] }));
  const res = makeRes();
  await controller.getPlayerReports({ body: { accountId, playerName: "Neo" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 200);
  assert.equal(res.body.data.summary.total, 1);
  assert.equal(res.body.data.summary.kills, 1);
  assert.equal(res.body.data.encounters[0].type, "kill");
  assert.equal(upstream.mock.callCount(), 1);
});
