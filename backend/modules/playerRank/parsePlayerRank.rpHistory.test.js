const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");

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

// Each test gets its own account id: the module-level caches in state.js persist across tests.
const accountFor = (letter) => "account." + letter.repeat(32);

function stubRouter(accountId, { ranked = RANKED } = {}) {
  const calls = [];
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
    if (url.endsWith("/ranked")) return ranked ? ok({ data: { attributes: { rankedGameModeStats: ranked } } }) : notFound();
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

function fakeHistory({ shouldThrow = false } = {}) {
  const calls = [];
  return {
    calls,
    annotate: async (args) => {
      calls.push(args);
      if (shouldThrow) throw new Error("history exploded");
      return {
        ...args.matches,
        summary: { ...args.matches.summary, rankPoints: { kind: "group", value: 37, matches: 3, since: 1 } },
      };
    },
  };
}

test("a fresh current-season lookup annotates matches and caches the annotated payload", async () => {
  const accountId = accountFor("a");
  stubRouter(accountId);
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
  assert.equal(history.calls.length, 1, "a cache hit must not re-annotate");
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
