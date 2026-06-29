const test = require("node:test");
const assert = require("node:assert");
const { createLeaderboardService } = require("../modules/leaderboard/leaderboardService");

const rawPayload = {
  included: [
    { type: "player", id: "account.a", attributes: { name: "Alpha", rank: 1, stats: { rankPoints: 6000 } } },
  ],
};

function makeService(overrides = {}) {
  const calls = { urls: [] };
  const doRequest = overrides.doRequest || (async (url) => { calls.urls.push(url); return rawPayload; });
  const getSeasonCatalog = overrides.getSeasonCatalog || (async () => ({ seasons: [{ id: "s-current" }], currentSeasonId: "s-current" }));
  const cache = overrides.cache || new Map();
  const service = createLeaderboardService({
    doRequest,
    getSeasonCatalog,
    leaderboardCache: cache,
    cacheDuration: overrides.cacheDuration ?? 60_000,
  });
  return { service, calls, cache };
}

test("fetches and maps the leaderboard for a region, defaulting to the current season", async () => {
  const { service, calls } = makeService();
  const result = await service.getLeaderboard({ platform: "pc-eu", gameMode: "squad-fpp" });
  assert.strictEqual(result.platform, "pc-eu");
  assert.strictEqual(result.gameMode, "squad-fpp");
  assert.strictEqual(result.seasonId, "s-current");
  assert.strictEqual(result.entries[0].name, "Alpha");
  assert.match(calls.urls[0], /\/shards\/pc-eu\/leaderboards\/s-current\/squad-fpp$/);
});

test("falls back to the default region for unknown platforms", async () => {
  const { service, calls } = makeService();
  const result = await service.getLeaderboard({ platform: "steam", gameMode: "solo", seasonId: "s1" });
  assert.strictEqual(result.platform, "pc-na");
  assert.match(calls.urls[0], /\/shards\/pc-na\/leaderboards\/s1\/solo$/);
});

test("serves cached data within the TTL without re-fetching", async () => {
  let hits = 0;
  const { service } = makeService({ doRequest: async () => { hits += 1; return rawPayload; } });
  await service.getLeaderboard({ platform: "pc-na", gameMode: "solo", seasonId: "s1" });
  await service.getLeaderboard({ platform: "pc-na", gameMode: "solo", seasonId: "s1" });
  assert.strictEqual(hits, 1);
});

test("falls back to stale cache when a refetch fails", async () => {
  const cache = new Map();
  let call = 0;
  const doRequest = async () => {
    call += 1;
    if (call === 1) return rawPayload;
    throw new Error("Rate Limit Reached");
  };
  const { service } = makeService({ doRequest, cache, cacheDuration: -1 }); // negative TTL forces a refetch each call
  const first = await service.getLeaderboard({ platform: "pc-eu", gameMode: "duo", seasonId: "s1" });
  const second = await service.getLeaderboard({ platform: "pc-eu", gameMode: "duo", seasonId: "s1" });
  assert.strictEqual(second.entries[0].name, first.entries[0].name);
});

test("getSeasons returns the catalog", async () => {
  const { service } = makeService();
  const seasons = await service.getSeasons();
  assert.strictEqual(seasons.currentSeasonId, "s-current");
});
