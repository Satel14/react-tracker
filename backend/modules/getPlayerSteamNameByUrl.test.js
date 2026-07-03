const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  isAllowedSteamUrl,
  getPlayerSteamNameByUrl,
} = require("./getPlayerSteamNameByUrl");

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

test("isAllowedSteamUrl accepts an https steamcommunity.com profile URL", () => {
  assert.equal(isAllowedSteamUrl("https://steamcommunity.com/id/someuser"), true);
});

test("isAllowedSteamUrl accepts steamcommunity.com subdomains over https", () => {
  assert.equal(isAllowedSteamUrl("https://ru.steamcommunity.com/profiles/76561198000000000"), true);
});

test("isAllowedSteamUrl rejects the cloud metadata IP over http and https", () => {
  assert.equal(isAllowedSteamUrl("http://169.254.169.254/latest/meta-data/"), false);
  assert.equal(isAllowedSteamUrl("https://169.254.169.254/latest/meta-data/"), false);
});

test("isAllowedSteamUrl rejects a look-alike host that only mentions steamcommunity.com in the query", () => {
  assert.equal(isAllowedSteamUrl("https://evil.com/?x=steamcommunity.com"), false);
});

test("isAllowedSteamUrl rejects a suffix-spoofed host", () => {
  assert.equal(isAllowedSteamUrl("https://steamcommunity.com.evil.com/id/x"), false);
});

test("isAllowedSteamUrl rejects non-https schemes and garbage input", () => {
  assert.equal(isAllowedSteamUrl("http://steamcommunity.com/id/someuser"), false);
  assert.equal(isAllowedSteamUrl("file:///etc/passwd"), false);
  assert.equal(isAllowedSteamUrl("not a url"), false);
  assert.equal(isAllowedSteamUrl(""), false);
  assert.equal(isAllowedSteamUrl(null), false);
});

test("getPlayerSteamNameByUrl refuses to fetch a disallowed URL (defense in depth)", async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error("should not fetch"); };
  const result = await getPlayerSteamNameByUrl("http://169.254.169.254/latest/meta-data/");
  assert.equal(result, null);
  assert.equal(called, false);
});

test("getPlayerSteamNameByUrl fetches and parses an allowed steamcommunity.com URL", async () => {
  const calls = [];
  global.fetch = async (u) => {
    calls.push(u);
    return {
      ok: true,
      status: 200,
      text: async () => "<profile><customURL>coolname</customURL></profile>",
    };
  };
  const result = await getPlayerSteamNameByUrl("https://steamcommunity.com/id/coolname");
  assert.equal(result, "coolname");
  assert.match(calls[0], /^https:\/\/steamcommunity\.com\/id\/coolname\/\?xml=1$/);
});
