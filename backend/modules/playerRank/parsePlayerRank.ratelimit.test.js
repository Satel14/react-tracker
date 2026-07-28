const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { setRateLimited } = require("./state");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

test("during cooldown with no stale data the lookup fails fast without upstream calls", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}) };
  };
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  setRateLimited();
  await assert.rejects(parse("steam", "CooldownNoStaleNeo", {}), /Rate Limit/);
  assert.equal(calls.length, 0, "no upstream request may fire during cooldown");
});

test("getPlayerExtras fails fast during cooldown when nothing is cached", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}) };
  };
  const { getPlayerExtras } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await assert.rejects(getPlayerExtras("steam", "CooldownExtrasNeo"), /Rate Limit/);
  assert.equal(calls.length, 0);
});

test("resolvePlayerBatch makes no upstream call during cooldown and reports every id missing", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}) };
  };
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const names = ["CooldownBatchAlpha", "CooldownBatchBeta"];
  const { resolved, missing } = await resolvePlayerBatch("steam", names);

  assert.equal(calls.length, 0, "batch resolve must not extend the cooldown with a fresh 429");
  assert.equal(resolved.length, 0);
  assert.deepEqual([...missing].sort(), [...names].sort());
});
