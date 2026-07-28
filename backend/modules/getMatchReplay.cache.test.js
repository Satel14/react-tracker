const { test } = require("node:test");
const assert = require("node:assert/strict");

// getMatchReplay.js does `const { loadMatchBundle } = require("./matchLoader")` at
// module load, so we must stub the export BEFORE requiring getMatchReplay and then
// force it to reload so it captures the stub instead of the real network loader.
const matchLoader = require("./matchLoader");
let bundle = null;
let loadCalls = 0;
matchLoader.loadMatchBundle = async () => {
  loadCalls += 1;
  return bundle;
};
delete require.cache[require.resolve("./getMatchReplay")];
const { getMatchReplay } = require("./getMatchReplay");

const matchAttributes = { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" };
const telemetry = [
  { _T: "LogMatchStart", characters: [
    { character: { accountId: "account.alpha", name: "Alpha", teamId: 1 } },
    { character: { accountId: "account.bravo", name: "Bravo", teamId: 2 } },
  ] },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.alpha", name: "Alpha", teamId: 1, location: { x: 100000, y: 100000, z: 0 } } },
  { _T: "LogPlayerPosition", common: { isGame: 1 }, elapsedTime: 10, character: { accountId: "account.bravo", name: "Bravo", teamId: 2, location: { x: 200000, y: 200000, z: 0 } } },
];

test("getMatchReplay keys its cache by focal identity so two players against the same match do not share focal highlighting", async () => {
  bundle = { matchShard: "steam", matchAttributes, telemetry };

  const first = await getMatchReplay({ shard: "steam", matchId: "m1", accountId: "account.alpha" });
  const second = await getMatchReplay({ shard: "steam", matchId: "m1", accountId: "account.bravo" });

  // Two focal identities are two cache keys, so both miss the replay cache and reach the loader.
  assert.equal(loadCalls, 2);

  assert.equal(first.players.find((p) => p.accountId === "account.alpha").isFocal, true);
  assert.equal(first.players.find((p) => p.accountId === "account.bravo").isFocal, false);

  assert.equal(second.players.find((p) => p.accountId === "account.alpha").isFocal, false);
  assert.equal(second.players.find((p) => p.accountId === "account.bravo").isFocal, true);

  // A cache key of only `shard:matchId` would return the very same object for both focal players.
  assert.notEqual(first, second);
});

test("a warm replay result is served without loading the telemetry bundle", async () => {
  bundle = { matchShard: "steam", matchAttributes, telemetry };

  const before = loadCalls;
  const first = await getMatchReplay({ shard: "steam", matchId: "warm-1", accountId: "account.alpha" });
  assert.equal(loadCalls - before, 1);

  const second = await getMatchReplay({ shard: "steam", matchId: "warm-1", accountId: "account.alpha" });
  assert.equal(loadCalls - before, 1, "a cached replay must not re-download the telemetry bundle");
  assert.equal(second, first);
});

test("psn and xbox fold to one console cache key, so the second platform reuses the result", async () => {
  bundle = { matchShard: "console", matchAttributes, telemetry };

  const before = loadCalls;
  const viaPsn = await getMatchReplay({ shard: "psn", matchId: "warm-2", accountId: "account.alpha" });
  const viaXbox = await getMatchReplay({ shard: "xbox", matchId: "warm-2", accountId: "account.alpha" });

  assert.equal(loadCalls - before, 1);
  assert.equal(viaXbox, viaPsn);
});
