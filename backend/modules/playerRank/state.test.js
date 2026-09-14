// Every cache in state.js is swept on a read of the SAME key: get() checks the
// timestamp and deletes an expired entry. An entry for a player nobody looks up
// again is therefore never collected at all, so a long-lived process serving a
// stream of distinct players grows until it is restarted. A statsCache payload
// is a mapped season plus lifetime plus eight matches -- tens to hundreds of KB
// each -- which makes this an OOM on a small instance rather than a wrong
// answer, and matchRegionCache was until now the only map with a ceiling.
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  statsCache,
  stalePlayerDataCache,
  extrasCache,
  lifetimeStatsCache,
  matchSummaryCache,
  playerProfileCache,
  clanCache,
  masteryCache,
  steamAvatarCache,
  playerCache,
  playerNameCache,
  rankPointReadingCache,
  leaderboardCache,
} = require("./state");

const BOUNDED = [
  ["statsCache", statsCache],
  ["stalePlayerDataCache", stalePlayerDataCache],
  ["extrasCache", extrasCache],
  ["lifetimeStatsCache", lifetimeStatsCache],
  ["matchSummaryCache", matchSummaryCache],
  ["playerProfileCache", playerProfileCache],
  ["clanCache", clanCache],
  ["masteryCache", masteryCache],
  ["steamAvatarCache", steamAvatarCache],
  ["playerCache", playerCache],
  ["playerNameCache", playerNameCache],
  ["rankPointReadingCache", rankPointReadingCache],
  ["leaderboardCache", leaderboardCache],
];

afterEach(() => BOUNDED.forEach(([, cache]) => cache.clear()));

test("no cache grows without a ceiling", () => {
  const overfilled = 30_000;
  BOUNDED.forEach(([name, cache]) => {
    for (let i = 0; i < overfilled; i += 1) cache.set(`key-${i}`, { timestamp: i, data: i });
    assert.ok(cache.size < overfilled, `${name} grew to ${cache.size} entries`);
  });
});

test("the entry dropped is the oldest one in", () => {
  const overfilled = 30_000;
  for (let i = 0; i < overfilled; i += 1) statsCache.set(`key-${i}`, { timestamp: i });

  assert.equal(statsCache.get("key-0"), undefined, "the first one in is gone");
  assert.ok(statsCache.get(`key-${overfilled - 1}`), "the last one in is kept");
});

// A ceiling that evicted on every write would make the cache useless. The point
// is a bound on the heap, not a bound on how much can be cached at once.
test("a cache holds a working set well past what one page view touches", () => {
  for (let i = 0; i < 200; i += 1) statsCache.set(`key-${i}`, { timestamp: i });
  assert.equal(statsCache.size, 200, "nothing was evicted below the ceiling");
});

test("rewriting a key does not count against the ceiling twice", () => {
  for (let i = 0; i < 50; i += 1) statsCache.set("one-key", { timestamp: i });
  assert.equal(statsCache.size, 1);
});
