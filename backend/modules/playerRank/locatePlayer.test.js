const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLocatePlayer } = require("./locatePlayer");
const { nameVariants } = require("./nameVariants");

const profileWith = (matches) => ({
  relationships: { matches: { data: Array.from({ length: matches }, (_, i) => ({ id: `m${i}` })) } },
});

// `hits` answers the exact name per platform: a string (its own account) or
// { name, accountId, matches }. `variantHits` answers spellings, keyed by the
// spelling asked for: { name?, accountId?, matches? }.
const fakeResolver = ({ hits = {}, variantHits = {}, fail = [] } = {}) => {
  const calls = [];
  const profiles = new Map();
  const remember = (platform, accountId, matches) => {
    if (matches !== undefined) profiles.set(`${platform}:${accountId}`, profileWith(matches));
  };
  const resolvePlayerBatch = async (platform, gameIds) => {
    calls.push({ platform, gameIds });
    if (fail.includes(platform)) throw new Error("Request failed with status 500");
    const resolved = [];
    gameIds.forEach((id) => {
      const exact = gameIds.length === 1 ? hits[platform] : undefined;
      const spec = exact !== undefined ? (typeof exact === "string" ? { name: exact } : exact) : variantHits[id];
      if (!spec) return;
      const accountId = spec.accountId || `account.${platform}.${spec.name || id}`;
      remember(platform, accountId, spec.matches);
      resolved.push({ gameId: id, accountId, name: spec.name || id });
    });
    return { resolved, missing: gameIds.filter((id) => !resolved.some((hit) => hit.gameId === id)) };
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

const exactPlatforms = (resolver, name) =>
  resolver.calls
    .filter((call) => call.gameIds.length === 1 && call.gameIds[0] === name)
    .map((call) => call.platform)
    .sort();

const variantCalls = (resolver, name) => resolver.calls.filter((call) => call.gameIds[0] !== name);

const platformsOf = (list) => list.map((hit) => hit.platform);

// Steam and Kakao are one PC account space (measured: the same name resolves
// to the same account id on both), so a name missing on one is missing on the
// other and only the consoles are worth asking.
test("a Steam search asks only the consoles for the exact name", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("steam", "Someone");
  assert.deepEqual(exactPlatforms(resolver, "Someone"), ["psn", "xbox"]);
});

test("a Kakao search asks only the consoles for the exact name", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("kakao", "Someone");
  assert.deepEqual(exactPlatforms(resolver, "Someone"), ["psn", "xbox"]);
});

test("a console search asks both PC shards and the other console", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("psn", "Someone");
  assert.deepEqual(exactPlatforms(resolver, "Someone"), ["kakao", "steam", "xbox"]);
});

test("xbl is the same platform as xbox", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("xbl", "Someone");
  assert.deepEqual(exactPlatforms(resolver, "Someone"), ["kakao", "psn", "steam"]);
});

// Stadia is gone; a hit there would send someone to a profile frozen since 2023.
test("a Stadia search asks the four live platforms and never Stadia", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("stadia", "Someone");
  assert.deepEqual(exactPlatforms(resolver, "Someone"), ["kakao", "psn", "steam", "xbox"]);
  assert.ok(resolver.calls.every((call) => call.platform !== "stadia"));
});

test("reports where the name was found, with the name PUBG returns and its recent matches", async () => {
  const resolver = fakeResolver({ hits: { xbox: { name: "Someone", matches: 111 } } });
  const result = await locateWith(resolver)("steam", "Someone");
  assert.deepEqual(result.found, [{ platform: "xbox", name: "Someone", matches: 111 }]);
  assert.equal(result.complete, true);
});

test("a hit whose profile is not cached reports its matches as unknown", async () => {
  const resolver = fakeResolver({ hits: { xbox: "Someone" } });
  const result = await locateWith(resolver)("steam", "Someone");
  assert.deepEqual(result.found, [{ platform: "xbox", name: "Someone", matches: null }]);
});

test("hits come back in a fixed platform order, not in the order they resolved", async () => {
  const resolver = fakeResolver({ hits: { kakao: "Dup", psn: "Dup", steam: "Dup" } });
  const result = await locateWith(resolver)("xbox", "Dup");
  assert.deepEqual(platformsOf(result.found), ["steam", "psn", "kakao"]);
});

test("a name found nowhere is a complete answer with no hits", async () => {
  const resolver = fakeResolver();
  assert.deepEqual(await locateWith(resolver)("steam", "Nobody"), { found: [], suggestions: [], complete: true });
});

test("the name is looked up trimmed", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("steam", "  Someone  ");
  assert.deepEqual(exactPlatforms(resolver, "Someone"), ["psn", "xbox"]);
});

const pcAccount = (steamMatches, kakaoMatches) => ({
  hits: {
    steam: { name: "PcPlayer", accountId: "account.pc", matches: steamMatches },
    kakao: { name: "PcPlayer", accountId: "account.pc", matches: kakaoMatches },
  },
});

// The account's matches live only on the shard it plays on; the other one is
// an empty profile.
test("one PC account is linked once, on the shard it plays on", async () => {
  const kakaoPlayer = await locateWith(fakeResolver(pcAccount(0, 66)))("xbox", "PcPlayer");
  assert.deepEqual(kakaoPlayer.found, [{ platform: "kakao", name: "PcPlayer", matches: 66 }]);

  const steamPlayer = await locateWith(fakeResolver(pcAccount(144, 0)))("xbox", "PcPlayer");
  assert.deepEqual(steamPlayer.found, [{ platform: "steam", name: "PcPlayer", matches: 144 }]);
});

test("a PC account with no matches anywhere, or none known, goes to Steam", async () => {
  const idle = await locateWith(fakeResolver(pcAccount(0, 0)))("psn", "PcPlayer");
  assert.deepEqual(platformsOf(idle.found), ["steam"]);

  const unknown = await locateWith(fakeResolver(pcAccount(undefined, undefined)))("psn", "PcPlayer");
  assert.deepEqual(platformsOf(unknown.found), ["steam"]);
});

test("a PC account that plays through both launchers goes to Steam", async () => {
  const both = await locateWith(fakeResolver(pcAccount(10, 5)))("psn", "PcPlayer");
  assert.deepEqual(platformsOf(both.found), ["steam"]);
});

test("two different PC accounts with one name are both linked", async () => {
  const resolver = fakeResolver({ hits: { steam: "Dup", kakao: "Dup" } });
  const result = await locateWith(resolver)("psn", "Dup");
  assert.deepEqual(platformsOf(result.found), ["steam", "kakao"]);
});

test("a console player's suggestion links to that console", async () => {
  const resolver = fakeResolver({ variantHits: { "golden-dog": { matches: 34 } } });
  const result = await locateWith(resolver)("psn", "golden_dog");
  assert.deepEqual(result.suggestions, [{ platform: "psn", name: "golden-dog", matches: 34 }]);
});

// One batched request: PUBG takes up to ten names per players call.
test("the spellings are asked on the searched platform, all in one request", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("steam", "Bravo.exe");
  assert.deepEqual(variantCalls(resolver, "Bravo.exe"), [
    { platform: "steam", gameIds: nameVariants("Bravo.exe") },
  ]);
});

test("a console search asks its spellings on that console", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("psn", "golden_dog");
  assert.deepEqual(variantCalls(resolver, "golden_dog").map((call) => call.platform), ["psn"]);
});

test("no spellings are asked on Stadia", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("stadia", "Bravo.exe");
  assert.deepEqual(variantCalls(resolver, "Bravo.exe"), []);
});

test("no request is spent on spellings when there are none", async () => {
  const resolver = fakeResolver();
  await locateWith(resolver)("steam", "ĦĦĦĦ");
  assert.deepEqual(variantCalls(resolver, "ĦĦĦĦ"), []);
});

test("suggestions name the spelling PUBG returned, with its recent matches", async () => {
  const resolver = fakeResolver({ variantHits: { bravo_exe: { matches: 67 } } });
  const result = await locateWith(resolver)("steam", "Bravo.exe");
  assert.deepEqual(result.suggestions, [{ platform: "steam", name: "bravo_exe", matches: 67 }]);
  assert.equal(result.complete, true);
});

// An account with no match in two weeks may well be someone else's, so the
// active ones lead and the list stays short.
test("suggestions put the busiest account first and stop at three", async () => {
  const [idle, busy, light, unknown] = nameVariants("shadow_44");
  const resolver = fakeResolver({
    variantHits: { [idle]: { matches: 0 }, [busy]: { matches: 103 }, [light]: { matches: 5 }, [unknown]: {} },
  });
  const result = await locateWith(resolver)("steam", "shadow_44");
  assert.deepEqual(result.suggestions, [
    { platform: "steam", name: busy, matches: 103 },
    { platform: "steam", name: light, matches: 5 },
    { platform: "steam", name: idle, matches: 0 },
  ]);
});

test("one platform failing makes the answer incomplete but keeps the other hits", async () => {
  const resolver = fakeResolver({ hits: { xbox: "Someone" }, fail: ["psn"] });
  const result = await locateWith(resolver)("steam", "Someone");
  assert.deepEqual(platformsOf(result.found), ["xbox"]);
  assert.equal(result.complete, false);
});

test("the spelling request failing makes the answer incomplete", async () => {
  const resolver = fakeResolver({ fail: ["steam"] });
  const result = await locateWith(resolver)("steam", "Bravo.exe");
  assert.equal(result.complete, false);
  assert.deepEqual(result.suggestions, []);
});

test("an active PUBG cooldown skips the lookup entirely", async () => {
  const resolver = fakeResolver({ hits: { xbox: "Someone" } });
  const result = await locateWith(resolver, () => true)("steam", "Someone");
  assert.deepEqual(result, { found: [], suggestions: [], complete: false });
  assert.equal(resolver.calls.length, 0);
});

// resolvePlayerBatch reports "missing" without asking PUBG while a cooldown
// runs, which would otherwise read as "not on that platform".
test("a cooldown that starts during the lookup makes the answer incomplete", async () => {
  const resolver = fakeResolver();
  let checks = 0;
  const result = await locateWith(resolver, () => checks++ > 0)("steam", "Someone");
  assert.equal(result.complete, false);
});

test("an account id is not a nickname, so nothing is looked up", async () => {
  const resolver = fakeResolver({ hits: { xbox: "Someone" } });
  const result = await locateWith(resolver)("steam", "account.0123456789abcdef0123456789abcdef");
  assert.deepEqual(result, { found: [], suggestions: [], complete: false });
  assert.equal(resolver.calls.length, 0);
});

test("a blank name is not looked up", async () => {
  const resolver = fakeResolver();
  assert.deepEqual(await locateWith(resolver)("steam", "   "), { found: [], suggestions: [], complete: false });
  assert.equal(resolver.calls.length, 0);
});
