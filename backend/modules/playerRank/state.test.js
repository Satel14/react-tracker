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
  setRateLimited,
  getCacheSizes,
} = require("./state");
const state = require("./state");
const { BoundedMap } = require("../boundedMap");
const { getRuntimeStats, __resetRuntimeStats } = require("../runtimeStats");

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

// setRateLimited is the single door every 429 in the codebase comes through --
// pubgApi, matchLoader, the leaderboard and the season catalog all call it. That
// is what makes it the one place worth counting: a counter at each caller would
// be four places to forget.
test("a rate limit is counted where /healthz can see it", () => {
  __resetRuntimeStats();

  setRateLimited();

  assert.equal(getRuntimeStats().rateLimit.count, 1);
});

// A cache sitting exactly on its ceiling is evicting on every write, which is
// invisible from the outside: the hit rate just quietly drops. Reporting the
// limit next to the size is what makes that readable without knowing the
// constants by heart.
test("reports every bounded cache against the ceiling it is measured by", () => {
  const exported = Object.entries(state)
    .filter(([, value]) => value instanceof BoundedMap)
    .map(([name]) => name);

  assert.ok(exported.length > 5, "sanity: state.js exports the caches");
  assert.deepEqual(
    Object.keys(getCacheSizes()).sort(),
    exported.sort(),
    "a cache was added to state.js without being reported on /healthz",
  );
});

test("a cache reports how full it is and what it is allowed to hold", () => {
  statsCache.set("one", { timestamp: 1 });
  statsCache.set("two", { timestamp: 2 });

  assert.deepEqual(getCacheSizes().statsCache, { size: 2, limit: statsCache.limit });
});
