const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shardForMatch, findTelemetryUrl } = require("./pubgTelemetry");

test("shardForMatch maps console platforms to console", () => {
  assert.equal(shardForMatch("steam"), "steam");
  assert.equal(shardForMatch("psn"), "console");
  assert.equal(shardForMatch("xbox"), "console");
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
