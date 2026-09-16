// Where a rank lookup ended up, counted at the point the decision is made.
//
// It cannot be counted at the cache instead: statsCache.get() returns an entry
// whose TTL has not been checked yet, and the very next line goes upstream when
// it has expired -- so a Map-level "found" would report a hit for a lookup that
// spent quota. refreshRankPointReading does a bookkeeping get() of its own on
// top, which would inflate the denominator with reads no visitor made.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");
const { setRateLimited, setStalePlayerData } = require("./state");
const { getRuntimeStats, __resetRuntimeStats } = require("../runtimeStats");

const realFetch = global.fetch;
beforeEach(() => __resetRuntimeStats());
afterEach(() => { global.fetch = realFetch; });

const SEASON_ID = "division.bro.official.pc-2018-43";

const ZERO_MODE = {
  kills: 0, assists: 0, wins: 0, losses: 0, roundsPlayed: 0,
  damageDealt: 0, top10s: 0, timeSurvived: 0, longestKill: 0,
  longestTimeSurvived: 0, headshotKills: 0, heals: 0, boosts: 0,
};

const RANKED_MODE = {
  currentRankPoint: 3000, bestRankPoint: 3100, roundsPlayed: 10,
  currentTier: { tier: "Gold", subTier: "1" },
  kills: 5, deaths: 5, assists: 1, wins: 1, top10s: 3,
  damageDealt: 500, avgRank: 20, kda: 1.2,
};

// The caches in state.js are module-level and outlive a single test, so every
// test here needs a player of its own or it reads the last one's answer.
function stubPlayer({ name, idChar, delayMs = 0 }) {
  const accountId = `account.${idChar.repeat(32)}`;
  const answer = async (body) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { ok: true, status: 200, json: async () => body };
  };

  global.fetch = async (url) => {
    if (url.includes("filter[playerNames]")) {
      return answer({
        data: [{
          id: accountId,
          attributes: { name, banType: "Innocent" },
          relationships: { matches: { data: [] } },
        }],
      });
    }
    if (url.endsWith("/seasons")) {
      return answer({
        data: [{ id: SEASON_ID, attributes: { isCurrentSeason: true, isOffseason: false } }],
      });
    }
    if (url.includes("/seasons/lifetime")) {
      return answer({ data: { attributes: { gameModeStats: { solo: ZERO_MODE } } } });
    }
    if (url.endsWith("/ranked")) {
      return answer({ data: { attributes: { rankedGameModeStats: { squad: RANKED_MODE } } } });
    }
    if (url.includes(`/seasons/${SEASON_ID}`)) {
      return answer({ data: { attributes: { gameModeStats: { solo: ZERO_MODE } } } });
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };
}

test("a lookup that goes upstream is counted as fresh", async () => {
  stubPlayer({ name: "CounterFreshNeo", idChar: "1" });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await parse("kakao", "CounterFreshNeo", {});

  const { rankLookups } = getRuntimeStats();
  assert.equal(rankLookups.fresh, 1);
  assert.equal(rankLookups.total, 1);
  assert.equal(rankLookups.servedFromCachePct, 0, "one lookup, and it cost a PUBG request");
});

// The 30-minute statsCache is the single biggest thing standing between this
// site and the 100-per-minute budget, and this is the number that says so.
test("a repeat lookup inside the cache window is counted as cached", async () => {
  stubPlayer({ name: "CounterCachedNeo", idChar: "2" });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await parse("kakao", "CounterCachedNeo", {});
  await parse("kakao", "CounterCachedNeo", {});

  const { rankLookups } = getRuntimeStats();
  assert.equal(rankLookups.fresh, 1);
  assert.equal(rankLookups.cached, 1);
  assert.equal(rankLookups.servedFromCachePct, 50);
});

// Two visitors asking for the same player at once share one upstream fetch.
// Counting the second as fresh would credit the budget with a request nobody
// made; counting it as cached would claim a cache that was still empty.
test("a lookup that joins one already in flight is counted as coalesced", async () => {
  stubPlayer({ name: "CounterFlightNeo", idChar: "3", delayMs: 20 });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const first = parse("kakao", "CounterFlightNeo", {});
  const second = parse("kakao", "CounterFlightNeo", {});
  await Promise.all([first, second]);

  const { rankLookups } = getRuntimeStats();
  assert.equal(rankLookups.fresh, 1, "only one of the two may have gone upstream");
  assert.equal(rankLookups.coalesced, 1);
  assert.equal(rankLookups.total, 2);
});

// The other way stale data gets served, and the one easy to miss: no cooldown
// was open when the request started, so it went upstream, and the 429 came back
// mid-flight. It is answered from the same stale entry as the cooldown path and
// has to be counted the same way -- otherwise the rate-limit incident it exists
// to describe reads as an ordinary fresh lookup.
//
// The stale entry is seeded rather than earned by a first lookup. Both stale
// tests would otherwise need a successful parse to set them up, and both leave
// a 20-second cooldown on module state behind them -- so whichever ran second
// would have its own setup refused, and the pair would pass or fail on
// declaration order rather than on the code.
test("stale data served after a 429 mid-flight is counted as stale", async () => {
  setStalePlayerData("steam:CounterMidflightNeo:current", { data: { seeded: true } });
  global.fetch = async () => ({
    ok: false, status: 429, statusText: "Too Many Requests", json: async () => ({}),
  });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const payload = await parse("steam", "CounterMidflightNeo", {});

  assert.ok(payload?.data, "the stale payload is what makes this path worth counting");
  const { rankLookups } = getRuntimeStats();
  assert.equal(rankLookups.stale, 1);
  assert.equal(rankLookups.fresh, 0, "it never got a usable answer from upstream");
});

// Last in the file on purpose: setRateLimited opens a 20-second cooldown on
// module state that every later test in this process would inherit.
test("a lookup answered from stale data during a cooldown is counted as stale", async () => {
  setStalePlayerData("steam:CounterStaleNeo:current", { data: { seeded: true } });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  setRateLimited();
  await parse("steam", "CounterStaleNeo", {});

  const { rankLookups } = getRuntimeStats();
  assert.equal(rankLookups.stale, 1);
  assert.equal(rankLookups.fresh, 0, "the cooldown means nothing went upstream");
  assert.equal(rankLookups.servedFromCachePct, 100);
});
