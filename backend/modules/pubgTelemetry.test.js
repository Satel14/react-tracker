const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { shardForMatch, findTelemetryUrl, fetchTelemetryHead } = require("./pubgTelemetry");
const { loadMatchBundle, __clearMatchCache } = require("./matchLoader");

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  __clearMatchCache();
});

test("fetchTelemetryHead asks for a byte range and returns what came back", async () => {
  let seen = null;
  global.fetch = async (url, options) => {
    seen = { url, headers: options.headers };
    return { ok: true, status: 206, text: async () => '[{"_T":"LogMatchDefinition"' };
  };

  const head = await fetchTelemetryHead("https://telemetry-cdn.pubg.com/x-telemetry.json", 2048);

  assert.equal(head, '[{"_T":"LogMatchDefinition"');
  assert.equal(seen.headers.Range, "bytes=0-2047");
});

test("fetchTelemetryHead throws away a full body when the CDN ignores the range", async () => {
  // A 200 means the whole file is on its way: ~24 MB of telemetry for a field
  // worth two letters. Cancel the stream rather than read it.
  let cancelled = false;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    body: { cancel: async () => { cancelled = true; } },
    text: async () => {
      throw new Error("the full body must never be read");
    },
  });

  assert.equal(await fetchTelemetryHead("https://telemetry-cdn.pubg.com/x-telemetry.json"), null);
  assert.equal(cancelled, true);
});

test("fetchTelemetryHead answers null instead of throwing when the read fails", async () => {
  global.fetch = async () => ({ ok: false, status: 403, text: async () => "" });
  assert.equal(await fetchTelemetryHead("https://telemetry-cdn.pubg.com/x-telemetry.json"), null);

  global.fetch = async () => { throw new Error("socket hang up"); };
  assert.equal(await fetchTelemetryHead("https://telemetry-cdn.pubg.com/x-telemetry.json"), null);
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
