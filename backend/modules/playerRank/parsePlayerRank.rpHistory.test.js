const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");
const { statsCache } = require("./state");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const SEASON = "division.bro.official.pc-2018-42";
const OLD_SEASON = "division.bro.official.pc-2018-41";
const ZERO_MODE = {
  kills: 0, assists: 0, wins: 0, losses: 0, roundsPlayed: 0,
  damageDealt: 0, top10s: 0, timeSurvived: 0, longestKill: 0,
  longestTimeSurvived: 0, headshotKills: 0, heals: 0, boosts: 0,
};
const RANKED = {
  "squad-fpp": {
    currentTier: { tier: "Diamond", subTier: "3" },
    bestTier: { tier: "Diamond", subTier: "2" },
    currentRankPoint: 3153,
    bestRankPoint: 3310,
    roundsPlayed: 292,
    kills: 500, assists: 200, wins: 20, damageDealt: 90000, top10Ratio: 0.4, dBNOs: 300,
  },
};

// Each test gets its own account id: the module-level caches in state.js persist
// across tests. The seed has to be hex -- anything else fails isStrictAccountId
// and sends the lookup down the name-resolution path instead.
const accountFor = (seed) => "account." + seed.repeat(32).slice(0, 32);

function stubRouter(accountId, { ranked = RANKED, rankedFailFrom = Infinity } = {}) {
  const calls = [];
  let rankedCalls = 0;
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const notFound = () => ({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) });
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("/seasons/lifetime")) return ok({ data: { attributes: { gameModeStats: { squad: ZERO_MODE } } } });
    if (url.endsWith("/seasons")) {
      return ok({ data: [
        { id: OLD_SEASON, attributes: { isCurrentSeason: false, isOffseason: false } },
        { id: SEASON, attributes: { isCurrentSeason: true, isOffseason: false } },
      ] });
    }
    if (url.endsWith("/ranked")) {
      rankedCalls += 1;
      if (rankedCalls >= rankedFailFrom) return notFound();
      return ranked ? ok({ data: { attributes: { rankedGameModeStats: ranked } } }) : notFound();
    }
    if (url.includes(`/seasons/${SEASON}`) || url.includes(`/seasons/${OLD_SEASON}`)) {
      return ok({ data: { attributes: { gameModeStats: { squad: ZERO_MODE } } } });
    }
    if (url.endsWith(`/players/${accountId}`)) {
      return ok({ data: {
        id: accountId,
        attributes: { name: "RpNeo", banType: "Innocent" },
        relationships: { matches: { data: [] } },
      } });
    }
    return notFound();
  };
  return calls;
}

function fakeHistory({ shouldThrow = false, enabled = true } = {}) {
  const calls = [];
  return {
    calls,
    isEnabled: () => enabled,
    annotate: async (args) => {
      calls.push(args);
      if (shouldThrow) throw new Error("history exploded");
      return {
        ...args.matches,
        // `matches` counts the calls so a refreshed annotation is distinguishable
        // from the one the fresh fetch cached.
        summary: { ...args.matches.summary, rankPoints: { kind: "group", value: 37, matches: calls.length, since: 1 } },
      };
    },
  };
}

const rankedReads = (calls) => calls.filter((url) => url.endsWith("/ranked")).length;

test("a fresh current-season lookup annotates matches and caches the annotated payload", async () => {
  const accountId = accountFor("a");
  const calls = stubRouter(accountId);
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "k", steamApiKey: "", rankPointHistory: history });

  const first = await parse("kakao", accountId, {});
  assert.equal(history.calls.length, 1);
  const call = history.calls[0];
  assert.equal(call.shard, "kakao");
  assert.equal(call.accountId, accountId);
  assert.equal(call.seasonId, SEASON);
  assert.deepEqual(call.rankedGameModeStats, RANKED);
  assert.equal(call.rankedInfo.tier, "diamond");
  assert.ok(Array.isArray(call.matches.items));
  assert.equal(first.data.matches.summary.rankPoints.kind, "group");

  const second = await parse("kakao", accountId, {});
  assert.equal(history.calls.length, 1, "the reading just taken by the fresh fetch holds off the refresh");
  assert.equal(rankedReads(calls), 1, "and no ranked request is spent inside the interval");
  assert.equal(second.data.matches.summary.rankPoints.kind, "group");
});

test("no ranked stats means no annotation", async () => {
  const accountId = accountFor("b");
  stubRouter(accountId, { ranked: null });
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "k", steamApiKey: "", rankPointHistory: history });

  const payload = await parse("kakao", accountId, {});
  assert.equal(history.calls.length, 0);
  assert.equal(payload.data.matches.summary.rankPoints, undefined);
});

test("a past-season lookup neither reads nor writes history", async () => {
  const accountId = accountFor("c");
  stubRouter(accountId);
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "k", steamApiKey: "", rankPointHistory: history });

  await parse("kakao", accountId, { seasonId: OLD_SEASON });
  assert.equal(history.calls.length, 0);
});

test("a throwing history service leaves the payload intact", async () => {
  const accountId = accountFor("d");
  stubRouter(accountId);
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: fakeHistory({ shouldThrow: true }),
  });

  const payload = await parse("kakao", accountId, {});
  assert.equal(payload.data.season.rankedInfo.tier, "diamond");
  assert.deepEqual(payload.data.matches.items, []);
  assert.equal(payload.data.matches.summary.rankPoints, undefined);
});

test("the default service is wired when none is injected", async () => {
  const accountId = accountFor("e");
  stubRouter(accountId);
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "k", steamApiKey: "" });
    const payload = await parse("kakao", accountId, {});
    assert.equal(payload.data.matches.summary.rankPoints, undefined, "unconfigured store passes matches through");
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }
});

// A session is only splittable into single matches when readings sit between
// them, and a warm cache hit used to take none at all -- so a player refreshing
// their own page between matches produced one reading per CACHE_DURATION.
test("a warm cache hit takes a fresh reading and serves the re-annotated payload", async () => {
  const accountId = accountFor("ab");
  const calls = stubRouter(accountId);
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: history, rankPointReadingIntervalMs: 0,
  });

  await parse("kakao", accountId, {});
  const warm = await parse("kakao", accountId, {});

  assert.equal(history.calls.length, 2, "the cache hit reads history again");
  assert.equal(rankedReads(calls), 2, "at the cost of exactly one more ranked request");
  assert.equal(warm.data.matches.summary.rankPoints.matches, 2, "the refreshed annotation reaches the response");

  const third = await parse("kakao", accountId, {});
  assert.equal(third.data.matches.summary.rankPoints.matches, 3, "and is what the next hit builds on");
});

// The whole point is a dense series beside a cheap payload. Bumping the entry's
// timestamp would keep renewing the 30-minute list for as long as somebody keeps
// looking, so the match list -- and every RP delta drawn on it -- would never
// refresh at all.
test("a refreshed reading does not extend the cached payload's TTL", async () => {
  const accountId = accountFor("ac");
  stubRouter(accountId);
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: fakeHistory(), rankPointReadingIntervalMs: 0,
  });

  await parse("kakao", accountId, {});
  const cacheKey = `kakao:${accountId}:${SEASON}`;
  // Backdated inside the TTL, because a same-millisecond comparison cannot tell a
  // preserved timestamp from one just reassigned to Date.now().
  const aged = statsCache.get(cacheKey);
  const before = aged.timestamp - 5 * 60 * 1000;
  statsCache.set(cacheKey, { ...aged, timestamp: before });

  await parse("kakao", accountId, {});

  const entry = statsCache.get(cacheKey);
  assert.equal(entry.timestamp, before, "the entry keeps its original age");
  assert.equal(entry.data.data.matches.summary.rankPoints.matches, 2, "while its payload carries the new reading");
});

test("a warm hit on a past season takes no reading", async () => {
  const accountId = accountFor("ad");
  const calls = stubRouter(accountId);
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: history, rankPointReadingIntervalMs: 0,
  });

  await parse("kakao", accountId, { seasonId: OLD_SEASON });
  // The fresh lookup reads /ranked for the season card either way; what must not
  // happen is a second one on the cache hit.
  const before = rankedReads(calls);
  await parse("kakao", accountId, { seasonId: OLD_SEASON });

  assert.equal(history.calls.length, 0);
  assert.equal(rankedReads(calls), before, "a closed season's RP cannot move");
});

// Ranked stats absent half an hour ago means the request would almost certainly
// buy nothing; a player's first ranked match of the season is picked up by the
// next fresh lookup instead.
test("a warm hit spends nothing on a player with no ranked stats", async () => {
  const accountId = accountFor("ae");
  const calls = stubRouter(accountId, { ranked: null });
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: history, rankPointReadingIntervalMs: 0,
  });

  await parse("kakao", accountId, {});
  const before = rankedReads(calls);
  await parse("kakao", accountId, {});

  assert.equal(history.calls.length, 0);
  assert.equal(rankedReads(calls), before, "no ranked request on the cache hit");
});

// annotate() is free to no-op without a database, but the fetch feeding it is not.
test("a warm hit spends nothing when the history store is disabled", async () => {
  const accountId = accountFor("af");
  const calls = stubRouter(accountId);
  const history = fakeHistory({ enabled: false });
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: history, rankPointReadingIntervalMs: 0,
  });

  await parse("kakao", accountId, {});
  await parse("kakao", accountId, {});

  assert.equal(rankedReads(calls), 1, "only the fresh fetch's own read");
});

test("a failed ranked read leaves the cached payload intact", async () => {
  const accountId = accountFor("bc");
  stubRouter(accountId, { rankedFailFrom: 2 });
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: history, rankPointReadingIntervalMs: 0,
  });

  const fresh = await parse("kakao", accountId, {});
  const warm = await parse("kakao", accountId, {});

  assert.equal(history.calls.length, 1, "a reading that could not be read is not invented");
  assert.equal(warm.data.season.rankedInfo.tier, "diamond");
  assert.deepEqual(warm.data.matches, fresh.data.matches, "the cached annotation survives untouched");
});

test("the refresh hands the rule the cached match list, fetch time and all", async () => {
  const accountId = accountFor("bd");
  stubRouter(accountId);
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "k", steamApiKey: "", rankPointHistory: history, rankPointReadingIntervalMs: 0,
  });

  await parse("steam", accountId, {});
  await parse("steam", accountId, {});

  const refreshed = history.calls[1];
  assert.equal(refreshed.shard, "steam");
  assert.equal(refreshed.accountId, accountId);
  assert.equal(refreshed.seasonId, SEASON);
  assert.deepEqual(refreshed.rankedGameModeStats, RANKED, "the freshly fetched ranked stats, not the cached ones");
  assert.equal(refreshed.rankedInfo.tier, "diamond");
  assert.equal(refreshed.matches.complete, true, "`complete` still reaches the rule");
  assert.ok(Number.isFinite(refreshed.matches.fetchedAt), "and so does the list's own fetch time");
});

test("the attribution rule is handed the fetch time and whether the list is the whole history", async () => {
  // statsMapper passes the enrichment object through untouched, and this is the
  // guard on that: if it ever starts rebuilding `matches`, the rule silently
  // loses both inputs and falls back to its most conservative behaviour.
  const accountId = accountFor("f");
  stubRouter(accountId);
  const history = fakeHistory();
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "k", steamApiKey: "", rankPointHistory: history });

  await parse("steam", accountId, {});

  const { matches } = history.calls[0];
  assert.equal(matches.complete, true, "this stub player has no matches at all, so the list is complete");
  assert.ok(Number.isFinite(matches.fetchedAt), "the fetch time reaches the rule");
});
