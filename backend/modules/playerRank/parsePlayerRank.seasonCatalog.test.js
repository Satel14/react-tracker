const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const ZERO_MODE = {
  kills: 0, assists: 0, wins: 0, losses: 0, roundsPlayed: 0,
  damageDealt: 0, top10s: 0, timeSurvived: 0, longestKill: 0,
  longestTimeSurvived: 0, headshotKills: 0, heals: 0, boosts: 0,
};

const SEASON_ID = "division.bro.official.pc-2018-30";

function playerRecord(id, name) {
  return {
    id,
    attributes: { name, banType: "Innocent" },
    relationships: { matches: { data: [] } },
  };
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("three concurrent rank lookups on one shard fetch the season catalog exactly once", async () => {
  const names = ["CatalogRaceAlpha", "CatalogRaceBeta", "CatalogRaceGamma"];
  const ids = names.map((_, i) => "account." + String(400 + i).padStart(32, "0"));
  const recordsByName = new Map(names.map((name, i) => [name, playerRecord(ids[i], name)]));

  const calls = [];
  let releaseSeasons;
  const seasonsGate = new Promise((resolve) => { releaseSeasons = resolve; });

  global.fetch = async (url) => {
    calls.push(url);

    if (url.includes("/seasons/lifetime")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: { gameModeStats: { solo: ZERO_MODE } } } }) };
    }

    if (url.endsWith("/seasons")) {
      // Hold the response open so every concurrent lookup reaches this point
      // before the catalog cache is populated.
      await seasonsGate;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: SEASON_ID, attributes: { isCurrentSeason: true, isOffseason: false } }],
        }),
      };
    }

    if (url.includes("filter[playerNames]=")) {
      const requested = decodeURIComponent(url.split("filter[playerNames]=")[1]);
      const record = recordsByName.get(requested);
      if (!record) return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: [record] }) };
    }

    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };

  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const pending = Promise.all(names.map((name) => parse("kakao", name, {})));
  await flush();
  releaseSeasons();
  const payloads = await pending;

  const catalogCalls = calls.filter((u) => u.endsWith("/seasons"));
  assert.equal(catalogCalls.length, 1, `expected one /seasons fetch, got ${catalogCalls.length}`);
  assert.equal(payloads.length, 3);
  payloads.forEach((payload, i) => {
    assert.equal(payload.data.platformInfo.platformUserHandle, names[i]);
  });
});
