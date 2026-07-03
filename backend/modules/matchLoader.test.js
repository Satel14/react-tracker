const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { loadMatchBundle, __clearMatchCache } = require("./matchLoader");

const realFetch = global.fetch;

function stubFetch(sequence) {
  // sequence: array of { ok, status, json } consumed in call order
  let i = 0;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const spec = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    return {
      ok: spec.ok !== false,
      status: spec.status || 200,
      json: async () => spec.json,
    };
  };
  return calls;
}

beforeEach(() => { __clearMatchCache(); });
afterEach(() => { global.fetch = realFetch; });

const matchJson = {
  data: { attributes: { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" },
          relationships: { assets: { data: [{ id: "a1" }] } } },
  included: [{ type: "asset", id: "a1", attributes: { URL: "https://telemetry.example/t.json" } }],
};
const telemetryJson = [{ _T: "LogMatchStart", characters: [] }];

test("loadMatchBundle downloads match + telemetry and returns the bundle", async () => {
  const calls = stubFetch([{ json: matchJson }, { json: telemetryJson }]);
  const bundle = await loadMatchBundle({ shard: "steam", matchId: "m1" });
  assert.equal(bundle.matchShard, "steam");
  assert.equal(bundle.matchAttributes.mapName, "Baltic_Main");
  assert.deepEqual(bundle.telemetry, telemetryJson);
  assert.equal(calls.length, 2); // match + telemetry
});

test("second call for the same match is served from cache (no new fetch)", async () => {
  const calls = stubFetch([{ json: matchJson }, { json: telemetryJson }]);
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  await loadMatchBundle({ shard: "steam", matchId: "m1" });
  assert.equal(calls.length, 2); // still only the first pair
});

test("psn/xbox fold to the console shard in the cache key and match URL", async () => {
  const calls = stubFetch([{ json: matchJson }, { json: telemetryJson }]);
  const bundle = await loadMatchBundle({ shard: "psn", matchId: "m1" });
  assert.equal(bundle.matchShard, "console");
  assert.match(calls[0], /shards\/console\/matches\/m1/);
});
