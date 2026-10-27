const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPcLauncherCheck } = require("./pcLauncher");

const ACCOUNT = "account.3cc264b9e6754f459de7caf048f700b7";

const recordWith = (matches) => ({
  id: ACCOUNT,
  relationships: { matches: { data: Array.from({ length: matches }, (_, i) => ({ id: `m${i}` })) } },
});

const fakeProfiles = (byShard = {}, { fail = [] } = {}) => {
  const calls = [];
  const getPlayerProfile = async (shard, accountId) => {
    calls.push({ shard, accountId });
    if (fail.includes(shard)) throw new Error("Request failed with status 500");
    return byShard[shard] === undefined ? null : recordWith(byShard[shard]);
  };
  return { calls, getPlayerProfile };
};

const checkWith = (profiles, isRateLimited = () => false) =>
  createPcLauncherCheck({ getPlayerProfile: profiles.getPlayerProfile, isRateLimited });

// Steam and Kakao answer for one PC account (measured 2026-10-27, 7 of 7
// names); its matches live only on the shard the player launches through.
test("an empty Steam profile is checked on Kakao, by account id", async () => {
  const profiles = fakeProfiles({ kakao: 66 });
  assert.deepEqual(await checkWith(profiles)("steam", ACCOUNT), { platform: "kakao", matches: 66 });
  assert.deepEqual(profiles.calls, [{ shard: "kakao", accountId: ACCOUNT }]);
});

test("an empty Kakao profile is checked on Steam", async () => {
  const profiles = fakeProfiles({ steam: 144 });
  assert.deepEqual(await checkWith(profiles)("kakao", ACCOUNT), { platform: "steam", matches: 144 });
});

test("no matches on the other launcher either means there is nothing to point at", async () => {
  assert.equal(await checkWith(fakeProfiles({ kakao: 0 }))("steam", ACCOUNT), null);
  assert.equal(await checkWith(fakeProfiles({}))("steam", ACCOUNT), null);
});

test("a failed lookup points nowhere", async () => {
  assert.equal(await checkWith(fakeProfiles({ kakao: 66 }, { fail: ["kakao"] }))("steam", ACCOUNT), null);
});

test("consoles have no second launcher, so nothing is asked", async () => {
  for (const platform of ["psn", "xbox", "xbl", "stadia"]) {
    const profiles = fakeProfiles({ steam: 10, kakao: 10 });
    assert.equal(await checkWith(profiles)(platform, ACCOUNT), null, platform);
    assert.equal(profiles.calls.length, 0, platform);
  }
});

test("only a real account id is looked up", async () => {
  for (const accountId of ["WhiteChaseSmoker", "account.xyz", "", null]) {
    const profiles = fakeProfiles({ kakao: 66 });
    assert.equal(await checkWith(profiles)("steam", accountId), null, String(accountId));
    assert.equal(profiles.calls.length, 0, String(accountId));
  }
});

test("an active PUBG cooldown skips the lookup", async () => {
  const profiles = fakeProfiles({ kakao: 66 });
  assert.equal(await checkWith(profiles, () => true)("steam", ACCOUNT), null);
  assert.equal(profiles.calls.length, 0);
});
