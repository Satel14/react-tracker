const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { shardForMatch, findTelemetryUrl } = require("./pubgTelemetry");
const { loadMatchBundle, __clearMatchCache } = require("./matchLoader");

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  __clearMatchCache();
});

test("shardForMatch folds console platforms and normalizes case", () => {
  assert.equal(shardForMatch("steam"), "steam");
  assert.equal(shardForMatch("kakao"), "kakao");
  assert.equal(shardForMatch("stadia"), "stadia");
  assert.equal(shardForMatch("psn"), "console");
  assert.equal(shardForMatch("xbox"), "console");
  assert.equal(shardForMatch("PSN"), "console");
  assert.equal(shardForMatch("  steam  "), "steam");
});

test("shardForMatch throws on an unknown / injected shard", () => {
  assert.throws(() => shardForMatch("steam/../../secret"), /Invalid shard/);
  assert.throws(() => shardForMatch("nope"), /Invalid shard/);
  assert.throws(() => shardForMatch(undefined), /Invalid shard/);
});

test("loadMatchBundle rejects a bad shard before making any network call", async () => {
  __clearMatchCache();
  let called = 0;
  global.fetch = async () => {
    called += 1;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await assert.rejects(
    loadMatchBundle({ shard: "steam/../../secret", matchId: "m1" }),
    /Invalid shard/
  );
  assert.equal(called, 0);
});

test("findTelemetryUrl returns the asset URL from the included list", () => {
  const payload = {
    data: { relationships: { assets: { data: [{ id: "a1" }] } } },
    included: [{ type: "asset", id: "a1", attributes: { URL: "https://cdn/x-telemetry.json" } }],
  };
  assert.equal(findTelemetryUrl(payload), "https://cdn/x-telemetry.json");
});

test("findTelemetryUrl returns null when no asset", () => {
  assert.equal(findTelemetryUrl({ included: [] }), null);
});
