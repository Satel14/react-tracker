const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { playerCache } = require("./state");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function accountId(seed) {
  return "account." + String(seed).padStart(32, "0");
}

function playerRecord(id, name) {
  return {
    id,
    attributes: { name, banType: "Innocent" },
    relationships: { matches: { data: [] } },
  };
}

function batchRouter(records) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("filter[playerNames]=")) {
      if (records.length === 0) {
        return { ok: false, status: 404, statusText: "Not Found", json: async () => ({ errors: [{ title: "Not Found", detail: "No Players Found Matching Criteria" }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: records }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };
  return calls;
}

test("resolves three fresh names in exactly one upstream fetch", async () => {
  const names = ["ResolveAlpha", "ResolveBeta", "ResolveGamma"];
  const ids = [accountId(1), accountId(2), accountId(3)];
  const records = names.map((name, i) => playerRecord(ids[i], name));
  const calls = batchRouter(records);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const { resolved, missing } = await resolvePlayerBatch("steam", names);

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1, "expected exactly one upstream fetch");
  assert.equal(missing.length, 0);
  assert.equal(resolved.length, 3);
  names.forEach((name, i) => {
    const entry = resolved.find((r) => r.gameId === name);
    assert.ok(entry, `expected ${name} to be resolved`);
    assert.equal(entry.accountId, ids[i]);
    assert.equal(entry.name, name);
  });
});

test("seeded caches let a later parsePlayerRank lookup skip name search and profile fetch", async () => {
  const name = "ResolveDeltaCacheProof";
  const id = accountId(4);
  const record = playerRecord(id, name);
  const calls = batchRouter([record]);
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("filter[playerNames]=")) {
      return { ok: true, status: 200, json: async () => ({ data: [record] }) };
    }
    if (url.endsWith("/seasons")) {
      return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
    }
    if (url.includes("/seasons/lifetime")) {
      return { ok: true, status: 200, json: async () => ({ data: { attributes: { gameModeStats: {} } } }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };

  const { resolvePlayerBatch, parsePlayerRank } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });
  const { resolved } = await resolvePlayerBatch("kakao", [name]);
  assert.equal(resolved.length, 1);

  await parsePlayerRank("kakao", name, {});

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1, "rank lookup must not repeat the name search");

  const bareProfileCalls = calls.filter(
    (u) => u.includes(`/players/${id}`) && !u.includes("filter") && !u.includes("/seasons") && !u.includes("mastery")
  );
  assert.equal(bareProfileCalls.length, 0, "rank lookup must not fetch the bare profile, it should be seeded already");
});

test("partial success: one real name resolves, one unknown is missing, still one fetch", async () => {
  const realName = "ResolveEpsilonReal";
  const unknownName = "ResolveEpsilonGhost";
  const id = accountId(5);
  const record = playerRecord(id, realName);
  const calls = batchRouter([record]);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const { resolved, missing } = await resolvePlayerBatch("steam", [realName, unknownName]);

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].gameId, realName);
  assert.equal(resolved[0].accountId, id);
  assert.deepEqual(missing, [unknownName]);
});

test("all-unknown names 404 -> every id reported missing, no throw", async () => {
  const names = ["ResolveZetaGhost1", "ResolveZetaGhost2"];
  const calls = batchRouter([]);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const { resolved, missing } = await resolvePlayerBatch("steam", names);

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1);
  assert.equal(resolved.length, 0);
  assert.deepEqual(missing.sort(), [...names].sort());
});

test("already-cached ids on a second call make zero upstream fetches", async () => {
  const name = "ResolveEtaRepeat";
  const id = accountId(6);
  const record = playerRecord(id, name);
  const calls = batchRouter([record]);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const first = await resolvePlayerBatch("steam", [name]);
  assert.equal(first.resolved.length, 1);
  const fetchesAfterFirst = calls.length;

  const second = await resolvePlayerBatch("steam", [name]);
  assert.equal(calls.length, fetchesAfterFirst, "second resolve must not touch the network");
  assert.equal(second.resolved.length, 1);
  assert.equal(second.resolved[0].accountId, id);
  assert.equal(second.missing.length, 0);
});

test("case-insensitive matching: a lowercase request matches the canonical mixed-case record", async () => {
  const canonicalName = "ResolveThetaCanon";
  const requestedName = canonicalName.toLowerCase();
  const id = accountId(7);
  const record = playerRecord(id, canonicalName);
  batchRouter([record]);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const { resolved, missing } = await resolvePlayerBatch("steam", [requestedName]);

  assert.equal(missing.length, 0);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].gameId, requestedName);
  assert.equal(resolved[0].accountId, id);
  assert.equal(resolved[0].name, canonicalName);
});

test("caps the upstream request at 10 names, reporting the rest as missing without extra fetches", async () => {
  const names = Array.from({ length: 12 }, (_, i) => `ResolveIota${i}`);
  const ids = names.map((_, i) => accountId(100 + i));
  const records = names.slice(0, 10).map((name, i) => playerRecord(ids[i], name));
  const calls = batchRouter(records);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const { resolved, missing } = await resolvePlayerBatch("steam", names);

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1, "must never fan out into more than one upstream request");
  assert.equal(resolved.length, 10);
  assert.deepEqual(missing.sort(), names.slice(10).sort());

  const [firstUrl] = searchCalls;
  names.slice(10).forEach((name) => {
    assert.ok(!firstUrl.includes(encodeURIComponent(name)), `capped name ${name} must not be in the request`);
  });
});

test("cached ids and strict account ids are skipped from the upstream request", async () => {
  const cachedName = "ResolveKappaCached";
  const cachedId = accountId(200);
  const strictId = accountId(201);
  const freshName = "ResolveKappaFresh";
  const freshId = accountId(202);

  const records = [playerRecord(cachedId, cachedName)];
  const calls = batchRouter(records);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await resolvePlayerBatch("steam", [cachedName]);
  calls.length = 0;

  const freshRecord = playerRecord(freshId, freshName);
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("filter[playerNames]=")) {
      return { ok: true, status: 200, json: async () => ({ data: [freshRecord] }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };

  const { resolved, missing } = await resolvePlayerBatch("steam", [cachedName, strictId, freshName]);

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1, "only the fresh name should require an upstream call");
  assert.ok(!searchCalls[0].includes(encodeURIComponent(cachedName)), "cached name must not be re-requested");
  assert.ok(!searchCalls[0].includes(strictId), "strict account id must not be requested by name");
  assert.equal(missing.length, 0);
  assert.equal(resolved.length, 3);
  assert.ok(resolved.some((r) => r.gameId === cachedName && r.accountId === cachedId));
  assert.ok(resolved.some((r) => r.gameId === strictId && r.accountId === strictId));
  assert.ok(resolved.some((r) => r.gameId === freshName && r.accountId === freshId));
});

test("case collision where only the canonical spelling exists leaves the other spelling unresolved", async () => {
  const canonicalName = "ResolveLambdaCanon";
  const ghostName = canonicalName.toLowerCase();
  const id = accountId(300);
  const record = playerRecord(id, canonicalName);

  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("filter[playerNames]=")) {
      if (url.endsWith(`filter[playerNames]=${ghostName}`)) {
        return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [record] }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
  };

  const { resolvePlayerBatch, parsePlayerRank: parse } = createParsePlayerRank({
    pubgApiKey: "test-key",
    steamApiKey: "",
  });

  const { resolved, missing } = await resolvePlayerBatch("steam", [canonicalName, ghostName]);

  assert.equal(resolved.length, 1, "only the canonical spelling exists upstream");
  assert.equal(resolved[0].gameId, canonicalName);
  assert.equal(resolved[0].accountId, id);
  assert.deepEqual(missing, [ghostName]);
  assert.equal(
    playerCache.get(`steam:${ghostName}`),
    undefined,
    "a name that does not exist must never be cached against another player's account id"
  );

  await assert.rejects(parse("steam", ghostName, {}), /Player not found/);
  const ghostSearches = calls.filter((u) => u.endsWith(`filter[playerNames]=${ghostName}`));
  assert.equal(ghostSearches.length, 1, "the unresolved spelling must be re-resolved, not served from cache");
});

test("case collision where both spellings exist gives each requested id its own account id", async () => {
  const upperName = "ResolveMuDup";
  const lowerName = upperName.toLowerCase();
  const upperId = accountId(301);
  const lowerId = accountId(302);
  const records = [playerRecord(upperId, upperName), playerRecord(lowerId, lowerName)];
  const calls = batchRouter(records);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const { resolved, missing } = await resolvePlayerBatch("steam", [upperName, lowerName]);

  assert.equal(calls.filter((u) => u.includes("filter[playerNames]=")).length, 1);
  assert.equal(missing.length, 0);
  assert.equal(resolved.length, 2, "each requested id must appear exactly once");
  assert.equal(new Set(resolved.map((r) => r.gameId)).size, 2);
  assert.equal(resolved.find((r) => r.gameId === upperName).accountId, upperId);
  assert.equal(resolved.find((r) => r.gameId === lowerName).accountId, lowerId);
  assert.equal(playerCache.get(`steam:${upperName}`), upperId);
  assert.equal(playerCache.get(`steam:${lowerName}`), lowerId);
});

test("two simultaneous resolves for the same names coalesce into one upstream fetch", async () => {
  const names = ["ResolveNuRace1", "ResolveNuRace2"];
  const ids = [accountId(303), accountId(304)];
  const records = names.map((name, i) => playerRecord(ids[i], name));
  const calls = batchRouter(records);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const [first, second] = await Promise.all([
    resolvePlayerBatch("steam", names),
    resolvePlayerBatch("steam", names),
  ]);

  const searchCalls = calls.filter((u) => u.includes("filter[playerNames]="));
  assert.equal(searchCalls.length, 1, "concurrent pre-warms must share one upstream request");
  [first, second].forEach((result) => {
    assert.equal(result.missing.length, 0);
    assert.equal(result.resolved.length, 2);
    names.forEach((name, i) => {
      assert.equal(result.resolved.find((r) => r.gameId === name).accountId, ids[i]);
    });
  });
});
