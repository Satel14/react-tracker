const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function extrasRouter(accountId, { failWeapon = false } = {}) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("/survival_mastery")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: {} } }) };
    }
    if (url.includes("/weapon_mastery")) {
      if (failWeapon) return { ok: false, status: 500, statusText: "Server Error", json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) };
    }
    if (url.includes(`/players/${accountId}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { id: accountId, attributes: { name: "ExtrasNeo", banType: "Innocent" }, relationships: {} },
        }),
      };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };
  return calls;
}

test("getPlayerExtras returns mastery extras and caches an ok result", async () => {
  const accountId = "account." + "f".repeat(32);
  const calls = extrasRouter(accountId);
  const { getPlayerExtras } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const first = await getPlayerExtras("steam", accountId);
  assert.equal(first.status, "ok");
  assert.ok(!("matches" in first));

  const fetchesAfterFirst = calls.length;
  const second = await getPlayerExtras("steam", accountId);
  assert.equal(second.status, "ok");
  assert.equal(calls.length, fetchesAfterFirst, "second call must be served from extrasCache");
});

test("getPlayerExtras coalesces concurrent lookups for the same player", async () => {
  const accountId = "account." + "0".repeat(31) + "1";
  const calls = extrasRouter(accountId);
  const { getPlayerExtras } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const [a, b] = await Promise.all([
    getPlayerExtras("steam", accountId),
    getPlayerExtras("steam", accountId),
  ]);

  assert.equal(a.status, "ok");
  assert.equal(b.status, "ok");
  const weaponCalls = calls.filter((u) => u.includes("/weapon_mastery"));
  assert.equal(weaponCalls.length, 1, "concurrent calls must share one in-flight fetch");
});

test("a partial result is served from cache on immediate retry (retry cooldown)", async () => {
  const accountId = "account." + "0".repeat(31) + "2";
  const calls = extrasRouter(accountId, { failWeapon: true });
  const { getPlayerExtras } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const first = await getPlayerExtras("steam", accountId);
  assert.equal(first.status, "partial");
  assert.match(first.error, /weapon mastery/);

  const fetchesAfterFirst = calls.length;
  const second = await getPlayerExtras("steam", accountId);
  assert.equal(second.status, "partial");
  assert.equal(calls.length, fetchesAfterFirst, "immediate retry must not refetch during the 120s cooldown");
});

test("extras after a by-name rank lookup reuses the search record (no bare profile fetch)", async () => {
  const accountId = "account." + "0".repeat(31) + "3";
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("filter[playerNames]=ByNameExtrasNeo")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            id: accountId,
            attributes: { name: "ByNameExtrasNeo", banType: "Innocent" },
            relationships: { matches: { data: [] } },
          }],
        }),
      };
    }
    if (url.includes("/seasons/lifetime")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: { gameModeStats: {} } } }) };
    }
    if (url.includes("/survival_mastery")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: {} } }) };
    }
    if (url.includes("/weapon_mastery")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };
  const { parsePlayerRank, getPlayerExtras } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const payload = await parsePlayerRank("kakao", "ByNameExtrasNeo", {});
  assert.equal(payload.data.profile.status, "deferred");

  const extras = await getPlayerExtras("kakao", "ByNameExtrasNeo");
  assert.equal(extras.status, "ok");

  const bareProfileFetches = calls.filter(
    (u) => u.includes(`/players/${accountId}`) && !u.includes("/seasons") && !u.includes("mastery")
  );
  assert.equal(bareProfileFetches.length, 0, `profile must come from the search record, got: ${bareProfileFetches.join(", ")}`);
  const searches = calls.filter((u) => u.includes("filter[playerNames]"));
  assert.equal(searches.length, 1);
});
