const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLocatePlayer } = require("./locatePlayer");

// A hit is either a name (its own account) or { name, accountId, matches }, for
// the Steam/Kakao case where both shards return one account.
const fakeResolver = (hits = {}, { fail = [] } = {}) => {
  const calls = [];
  const profiles = new Map();
  const resolvePlayerBatch = async (platform, gameIds) => {
    calls.push({ platform, gameIds });
    if (fail.includes(platform)) throw new Error("Request failed with status 500");
    const hit = typeof hits[platform] === "string" ? { name: hits[platform] } : hits[platform];
    if (!hit) return { resolved: [], missing: [...gameIds] };
    const accountId = hit.accountId || `account.${platform}`;
    if (hit.matches !== undefined) {
      profiles.set(`${platform}:${accountId}`, {
        relationships: { matches: { data: Array.from({ length: hit.matches }, (_, i) => ({ id: `m${i}` })) } },
      });
    }
    return { resolved: [{ gameId: gameIds[0], accountId, name: hit.name }], missing: [] };
  };
  const getProfileRecord = (shard, accountId) => profiles.get(`${shard}:${accountId}`) || null;
  return { calls, resolvePlayerBatch, getProfileRecord };
};

const locateWith = (resolver, isRateLimited = () => false) =>
  createLocatePlayer({
    resolvePlayerBatch: resolver.resolvePlayerBatch,
    getProfileRecord: resolver.getProfileRecord,
    isRateLimited,
  });

const platformsCalled = (resolver) => resolver.calls.map((call) => call.platform).sort();

// Steam and Kakao are one PC account space (measured: the same name resolves
// to the same account id on both), so a name missing on one is missing on the
// other and only the consoles are worth asking.
test("a Steam search asks only the consoles", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("steam", "Someone");
  assert.deepEqual(platformsCalled(resolver), ["psn", "xbox"]);
});

test("a Kakao search asks only the consoles", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("kakao", "Someone");
  assert.deepEqual(platformsCalled(resolver), ["psn", "xbox"]);
});

test("a console search asks both PC shards and the other console", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("psn", "Someone");
  assert.deepEqual(platformsCalled(resolver), ["kakao", "steam", "xbox"]);
});

const pcAccount = (steamMatches, kakaoMatches) => ({
  steam: { name: "PcPlayer", accountId: "account.pc", matches: steamMatches },
  kakao: { name: "PcPlayer", accountId: "account.pc", matches: kakaoMatches },
});

// The account's matches live only on the shard it plays on; the other one is
// an empty profile.
test("one PC account is linked once, on the shard it plays on", async () => {
  const kakaoPlayer = await locateWith(fakeResolver(pcAccount(0, 66)))("xbox", "PcPlayer");
  assert.deepEqual(kakaoPlayer.found, [{ platform: "kakao", name: "PcPlayer" }]);

  const steamPlayer = await locateWith(fakeResolver(pcAccount(144, 0)))("xbox", "PcPlayer");
  assert.deepEqual(steamPlayer.found, [{ platform: "steam", name: "PcPlayer" }]);
});

test("a PC account with no matches anywhere, or none known, goes to Steam", async () => {
  const idle = await locateWith(fakeResolver(pcAccount(0, 0)))("psn", "PcPlayer");
  assert.deepEqual(idle.found, [{ platform: "steam", name: "PcPlayer" }]);

  const unknown = await locateWith(fakeResolver(pcAccount(undefined, undefined)))("psn", "PcPlayer");
  assert.deepEqual(unknown.found, [{ platform: "steam", name: "PcPlayer" }]);
});

test("a PC account that plays through both launchers goes to Steam", async () => {
  const both = await locateWith(fakeResolver(pcAccount(10, 5)))("psn", "PcPlayer");
  assert.deepEqual(both.found, [{ platform: "steam", name: "PcPlayer" }]);
});

test("two different PC accounts with one name are both linked", async () => {
  const resolver = fakeResolver({ steam: "Dup", kakao: "Dup" });
  const result = await locateWith(resolver)("psn", "Dup");
  assert.deepEqual(result.found.map((hit) => hit.platform), ["steam", "kakao"]);
});

test("xbl is the same platform as xbox", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("xbl", "Someone");
  assert.deepEqual(platformsCalled(resolver), ["kakao", "psn", "steam"]);
});

// Stadia is gone; a hit there would send someone to a profile frozen since 2023.
test("a Stadia search checks the four live platforms and never Stadia", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("stadia", "Someone");
  assert.deepEqual(platformsCalled(resolver), ["kakao", "psn", "steam", "xbox"]);
});

test("reports where the name was found, spelled the way PUBG returns it", async () => {
  const resolver = fakeResolver({ xbox: "WhiteChaseSmoker" });
  const result = await locateWith(resolver)("steam", "WhiteChaseSmoker");
  assert.deepEqual(result, { found: [{ platform: "xbox", name: "WhiteChaseSmoker" }], complete: true });
});

test("hits come back in a fixed platform order, not in the order they resolved", async () => {
  const resolver = fakeResolver({ kakao: "Dup", psn: "Dup", steam: "Dup" });
  const result = await locateWith(resolver)("xbox", "Dup");
  assert.deepEqual(result.found.map((hit) => hit.platform), ["steam", "psn", "kakao"]);
});

test("a name found nowhere is a complete answer with no hits", async () => {
  const resolver = fakeResolver();
  assert.deepEqual(await locateWith(resolver)("steam", "Nobody"), { found: [], complete: true });
});

test("the name is looked up trimmed, one name per platform", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("steam", "  Someone  ");
  assert.ok(resolver.calls.every((call) => JSON.stringify(call.gameIds) === '["Someone"]'));
});

// "Not anywhere else" is a claim the page makes to the visitor, so it may only
// be made when every platform actually answered.
test("one platform failing makes the answer incomplete but keeps the other hits", async () => {
  const resolver = fakeResolver({ xbox: "Someone" }, { fail: ["psn"] });
  const result = await locateWith(resolver)("steam", "Someone");
  assert.deepEqual(result, { found: [{ platform: "xbox", name: "Someone" }], complete: false });
});

test("an active PUBG cooldown skips the lookup entirely", async () => {
  const resolver = fakeResolver({ xbox: "Someone" });
  const result = await locateWith(resolver, () => true)("steam", "Someone");
  assert.deepEqual(result, { found: [], complete: false });
  assert.equal(resolver.calls.length, 0);
});

// resolvePlayerBatch answers "missing" without asking PUBG while a cooldown
// runs, which would otherwise read as "not on that platform".
test("a cooldown that starts during the lookup makes the answer incomplete", async () => {
  const resolver = fakeResolver();
  let checks = 0;
  const result = await locateWith(resolver, () => checks++ > 0)("steam", "Someone");
  assert.equal(result.complete, false);
});

test("an account id is not a nickname, so nothing is looked up", async () => {
  const resolver = fakeResolver({ xbox: "Someone" });
  const result = await locateWith(resolver)("steam", "account.0123456789abcdef0123456789abcdef");
  assert.deepEqual(result, { found: [], complete: false });
  assert.equal(resolver.calls.length, 0);
});

test("a blank name is not looked up", async () => {
  const resolver = fakeResolver();
  assert.deepEqual(await locateWith(resolver)("steam", "   "), { found: [], complete: false });
  assert.equal(resolver.calls.length, 0);
});
