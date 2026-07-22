const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const STRICT_ID = "account." + "d".repeat(32);
const PROFILE_URL_SUFFIX = `/players/${STRICT_ID}`;

const ZERO_MODE = {
  kills: 0, assists: 0, wins: 0, losses: 0, roundsPlayed: 0,
  damageDealt: 0, top10s: 0, timeSurvived: 0, longestKill: 0,
  longestTimeSurvived: 0, headshotKills: 0, heals: 0, boosts: 0,
};

function stubRouter() {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("/seasons/lifetime")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: { gameModeStats: { solo: ZERO_MODE } } } }) };
    }
    if (url.endsWith("/seasons")) {
      return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
    }
    if (url.includes(PROFILE_URL_SUFFIX)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: STRICT_ID,
            attributes: { name: "DedupeNeo", banType: "Innocent" },
            relationships: { matches: { data: [] } },
          },
        }),
      };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };
  return calls;
}

test("an account-id lookup fetches /players/{id} exactly once across resolve and enrichment", async () => {
  const calls = stubRouter();
  const parse = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const payload = await parse("kakao", STRICT_ID, {});

  const profileCalls = calls.filter((u) => u.includes(PROFILE_URL_SUFFIX) && !u.includes("filter") && !u.includes("/seasons"));
  assert.equal(profileCalls.length, 1, `expected one profile fetch, got: ${profileCalls.join(", ")}`);
  assert.ok(calls.every((u) => !u.includes("filter[playerNames]")), "no name-search call for a strict account id");
  assert.ok(calls.every((u) => !u.includes("mastery") && !u.includes("/clans/")), "rank flow must not fetch clan/mastery");
  assert.equal(payload.data.profile.status, "deferred");
  assert.equal(payload.data.platformInfo.platformUserHandle, "DedupeNeo");
});
