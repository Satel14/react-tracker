const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validationResult } = require("express-validator");
const { validate } = require("./player");

async function runValidators(method, req) {
  const chains = validate(method);
  for (const chain of chains) await chain.run(req);
  return validationResult(req);
}

test("getMatchReplay validators accept a known shard and a normal matchId", async () => {
  const req = { params: { matchId: "abc-123" }, query: { shard: "steam" } };
  const result = await runValidators("getMatchReplay", req);
  assert.equal(result.isEmpty(), true);
});

test("getMatchReplay validators reject an injected shard", async () => {
  const req = { params: { matchId: "abc-123" }, query: { shard: "steam/../../evil" } };
  const result = await runValidators("getMatchReplay", req);
  assert.equal(result.isEmpty(), false);
});

test("getMatchReplay validators reject an over-long matchId", async () => {
  const req = { params: { matchId: "x".repeat(65) }, query: {} };
  const result = await runValidators("getMatchReplay", req);
  assert.equal(result.isEmpty(), false);
});

test("getMatchAnalysis validators reject an over-long playerName", async () => {
  const req = { params: { matchId: "m1" }, query: { playerName: "x".repeat(65) } };
  const result = await runValidators("getMatchAnalysis", req);
  assert.equal(result.isEmpty(), false);
});

test("getPlayerData validators cap the gameId length", async () => {
  const tooLong = { body: { platform: "steam", gameId: "x".repeat(65) } };
  assert.equal((await runValidators("getPlayerData", tooLong)).isEmpty(), false);

  const ok = { body: { platform: "steam", gameId: "shroud" } };
  assert.equal((await runValidators("getPlayerData", ok)).isEmpty(), true);
});
