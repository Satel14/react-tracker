const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
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
// test in this file needs a player of its own or it reads the last one's answer.
function stubPlayer({ name, idChar, delayMs = 10, failRanked = false }) {
  const accountId = `account.${idChar.repeat(32)}`;
  const meter = { inFlight: 0, max: 0, order: [] };

  // Every stat leg parks for a tick before answering, so a serial caller can
  // only ever have one in the air and a parallel one has all of them.
  const park = async (label, body) => {
    meter.inFlight += 1;
    meter.max = Math.max(meter.max, meter.inFlight);
    meter.order.push(label);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    meter.inFlight -= 1;
    return { ok: true, status: 200, json: async () => body };
  };

  global.fetch = async (url) => {
    if (url.includes("filter[playerNames]")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            id: accountId,
            attributes: { name, banType: "Innocent" },
            relationships: { matches: { data: [] } },
          }],
        }),
      };
    }

    if (url.endsWith("/seasons")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: SEASON_ID, attributes: { isCurrentSeason: true, isOffseason: false } }],
        }),
      };
    }

    if (url.includes("/seasons/lifetime")) {
      return park("lifetime", { data: { attributes: { gameModeStats: { solo: ZERO_MODE } } } });
    }

    if (url.endsWith("/ranked")) {
      if (failRanked) {
        meter.order.push("ranked:failed");
        return { ok: false, status: 500, statusText: "Server Error", json: async () => ({}) };
      }
      return park("ranked", { data: { attributes: { rankedGameModeStats: { squad: RANKED_MODE } } } });
    }

    if (url.includes(`/seasons/${SEASON_ID}`)) {
      return park("season", { data: { attributes: { gameModeStats: { solo: ZERO_MODE } } } });
    }

    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };

  return meter;
}

test("lifetime, season and ranked stats are fetched concurrently, not one after another", async () => {
  const meter = stubPlayer({ name: "ConcurrentNeo", idChar: "e" });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await parse("kakao", "ConcurrentNeo", {});

  assert.deepEqual(
    [...meter.order].sort(),
    ["lifetime", "ranked", "season"],
    `expected all three stat legs to be requested, got: ${meter.order.join(", ")}`
  );
  assert.equal(
    meter.max,
    3,
    `the three stat legs are independent and must be in flight together; peak concurrency was ${meter.max}`
  );
});

test("a ranked leg that fails still yields a payload built from the other two", async () => {
  const meter = stubPlayer({ name: "PartialNeo", idChar: "f", failRanked: true });
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const payload = await parse("kakao", "PartialNeo", {});

  assert.ok(meter.order.includes("ranked:failed"), "the ranked leg must have been attempted");
  assert.ok(payload.data, `expected a payload, got ${JSON.stringify(Object.keys(payload || {}))}`);
  assert.equal(payload.data.platformInfo.platformUserHandle, "PartialNeo");
  assert.equal(payload.data.season.rankedInfo, null, "a failed ranked leg leaves rankedInfo empty, it does not throw");
});
