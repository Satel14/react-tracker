const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
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
  return calls;
}

test("a cached payload's stale handle loses to the freshly resolved name", async () => {
  const oldName = "RepairRenamedOld";
  const newName = "RepairRenamedNew";
  const id = accountId(21);
  let currentName = oldName;
  router(() => playerRecord(id, currentName));
  const { parsePlayerRank: parse, resolvePlayerBatch } = createParsePlayerRank({
    pubgApiKey: "test-key",
    steamApiKey: "",
  });

  const before = await parse("steam", oldName, {});
  assert.equal(before.data.platformInfo.platformUserHandle, oldName);

  currentName = newName;
  const after = await parse("steam", newName, {});

  assert.equal(after.data.platformInfo.platformUserId, id, "same account, served from the cached stats");
  assert.equal(
    after.data.platformInfo.platformUserHandle,
    newName,
    "the cached handle must not overwrite the name resolved by this request"
  );

  const { resolved } = await resolvePlayerBatch("steam", [id]);
  assert.equal(resolved[0].name, newName, "the stale handle must not be written back into the name cache");
});

test("a cached account-id handle is still repaired into the resolved handle", async () => {
  const id = accountId(22);
  const name = "RepairAccountHandle";
  router(() => playerRecord(id, name));
  const { parsePlayerRank: parse } = createParsePlayerRank({ pubgApiKey: "test-key", steamApiKey: "" });

  const byId = await parse("steam", id, {});
  assert.equal(
    byId.data.platformInfo.platformUserHandle,
    id,
    "no name is reachable for this account, so the cached handle is the account id"
  );

  const byName = await parse("steam", name, {});
  assert.equal(byName.data.platformInfo.platformUserHandle, name, "an account-id handle must still be repaired");
});
