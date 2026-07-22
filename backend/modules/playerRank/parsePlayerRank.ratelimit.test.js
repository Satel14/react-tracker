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
  const parse = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  setRateLimited();
  await assert.rejects(parse("steam", "CooldownNoStaleNeo", {}), /Rate Limit/);
  assert.equal(calls.length, 0, "no upstream request may fire during cooldown");
});
