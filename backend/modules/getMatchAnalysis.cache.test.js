const { test } = require("node:test");
const assert = require("node:assert/strict");

const matchLoader = require("./matchLoader");
let loadCalls = 0;
let bundle = null;
matchLoader.loadMatchBundle = async () => {
  loadCalls += 1;
  return bundle;
};
delete require.cache[require.resolve("./getMatchAnalysis")];
const { getMatchAnalysis } = require("./getMatchAnalysis");

const matchAttributes = { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" };
const matchPayload = {
  data: { attributes: matchAttributes },
  included: [
    { type: "participant", id: "p1", attributes: { stats: { playerId: "account.me", name: "Me", kills: 1, damageDealt: 100 } } },
    { type: "roster", id: "r1", attributes: { won: "true", stats: { rank: 1, teamId: 10 } }, relationships: { participants: { data: [{ id: "p1" }] } } },
  ],
};
const telemetry = [
  { _T: "LogMatchStart", characters: [{ character: { accountId: "account.me", name: "Me", teamId: 10 } }] },
];

test("a warm analysis result is served without loading the telemetry bundle", async () => {
  loadCalls = 0;
  bundle = { matchShard: "steam", matchAttributes, matchPayload, telemetry };

  const first = await getMatchAnalysis({ shard: "steam", matchId: "warm-1", accountId: "account.me" });
  assert.equal(loadCalls, 1);

  const second = await getMatchAnalysis({ shard: "steam", matchId: "warm-1", accountId: "account.me" });
  assert.equal(loadCalls, 1, "a cached analysis must not re-download the telemetry bundle");
  assert.equal(second, first);
});

test("psn and xbox fold to one console cache key, so the second platform reuses the result", async () => {
  loadCalls = 0;
  bundle = { matchShard: "console", matchAttributes, matchPayload, telemetry };

  const viaPsn = await getMatchAnalysis({ shard: "psn", matchId: "warm-2", accountId: "account.me" });
  const viaXbox = await getMatchAnalysis({ shard: "xbox", matchId: "warm-2", accountId: "account.me" });

  assert.equal(loadCalls, 1);
  assert.equal(viaXbox, viaPsn);
});

test("a different focal player is still a cache miss", async () => {
  loadCalls = 0;
  bundle = { matchShard: "steam", matchAttributes, matchPayload, telemetry };

  await getMatchAnalysis({ shard: "steam", matchId: "warm-3", accountId: "account.me" });
  await getMatchAnalysis({ shard: "steam", matchId: "warm-3", accountId: "account.other" });

  assert.equal(loadCalls, 2);
});
