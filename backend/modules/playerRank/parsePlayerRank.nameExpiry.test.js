const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { PLAYER_NAME_CACHE_DURATION } = require("./state");
const { createParsePlayerRank } = require("./parsePlayerRank");

const realFetch = global.fetch;
const realNow = Date.now;
afterEach(() => {
  global.fetch = realFetch;
  Date.now = realNow;
});

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

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
}

function router(currentRecord) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("filter[playerNames]=")) {
      const record = currentRecord();
      const requested = decodeURIComponent(url.split("filter[playerNames]=")[1])
        .split(",")
        .map((name) => name.toLowerCase());
      if (!requested.includes(record.attributes.name.toLowerCase())) return notFound();
      return ok({ data: [record] });
    }
    if (url.includes("/seasons/lifetime")) {
      return ok({ data: { attributes: { gameModeStats: {} } } });
    }
    return notFound();
  };
  return {
    calls,
    searches: () => calls.filter((url) => url.includes("filter[playerNames]=")),
  };
}

function freezeClockAt(offset) {
  const base = realNow();
  Date.now = () => base + offset;
}

test("an expired name mapping is re-resolved, so a reused name serves its new owner", async () => {
  const name = "ExpiryRenameNomad";
  const firstOwner = accountId(11);
  const secondOwner = accountId(12);
  let record = playerRecord(firstOwner, name);
  const { searches } = router(() => record);
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const before = await parse("steam", name, {});
  assert.equal(before.data.platformInfo.platformUserId, firstOwner);

  record = playerRecord(secondOwner, name);
  freezeClockAt(PLAYER_NAME_CACHE_DURATION + 1000);

  const after = await parse("steam", name, {});

  assert.equal(searches().length, 2, "the expired mapping must be re-resolved upstream");
  assert.equal(
    after.data.platformInfo.platformUserId,
    secondOwner,
    "a reused name must serve its current owner, not the account cached before the rename"
  );
  assert.equal(after.data.platformInfo.platformUserHandle, name);
});

test("a repeat lookup inside the TTL still makes no name-resolve call", async () => {
  const name = "ExpiryWithinTtl";
  const id = accountId(13);
  const record = playerRecord(id, name);
  const { searches } = router(() => record);
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await parse("steam", name, {});
  assert.equal(searches().length, 1);

  freezeClockAt(PLAYER_NAME_CACHE_DURATION - 60 * 1000);

  const second = await parse("steam", name, {});

  assert.equal(searches().length, 1, "a mapping inside the TTL must still spare the resolve request");
  assert.equal(second.data.platformInfo.platformUserId, id);
});

test("the account-id to display-name mapping expires as well", async () => {
  const name = "ExpiryDisplayName";
  const id = accountId(16);
  const record = playerRecord(id, name);
  const { searches } = router(() => record);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  await resolvePlayerBatch("steam", [name]);
  const fresh = await resolvePlayerBatch("steam", [id]);
  assert.equal(fresh.resolved[0].name, name);
  assert.equal(searches().length, 1);

  freezeClockAt(PLAYER_NAME_CACHE_DURATION + 1000);

  const expired = await resolvePlayerBatch("steam", [id]);
  assert.equal(expired.resolved[0].name, null, "a name from before a possible rename must not be served forever");
});

test("batch-seeded canonical spellings expire on the same clock", async () => {
  const canonical = "ExpiryBatchCanon";
  const requested = canonical.toLowerCase();
  const firstOwner = accountId(14);
  const secondOwner = accountId(15);
  let record = playerRecord(firstOwner, canonical);
  const { searches } = router(() => record);
  const { resolvePlayerBatch } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const first = await resolvePlayerBatch("steam", [requested]);
  assert.equal(first.resolved[0].accountId, firstOwner);

  const seeded = await resolvePlayerBatch("steam", [canonical]);
  assert.equal(searches().length, 1, "the canonical spelling is seeded by the requested spelling's fetch");
  assert.equal(seeded.resolved[0].accountId, firstOwner);

  record = playerRecord(secondOwner, canonical);
  freezeClockAt(PLAYER_NAME_CACHE_DURATION + 1000);

  const afterExpiry = await resolvePlayerBatch("steam", [canonical]);

  assert.equal(searches().length, 2, "the seeded canonical spelling must expire, not live forever");
  assert.equal(afterExpiry.resolved[0].accountId, secondOwner);
});
