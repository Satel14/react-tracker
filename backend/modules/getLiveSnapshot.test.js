// The live card carries two readings from two unrelated hosts: Steam's
// concurrent-player count and PUBG's season. They were fetched with Promise.all,
// which rejects as soon as either does, so a 429 on one blanked the other.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const MODULE = require.resolve("./getLiveSnapshot");

const realFetch = global.fetch;
const realEnv = { ...process.env };

// The module caches a snapshot for a minute and reads PUBG_API_KEY at import
// time, so each test needs its own copy of it.
const freshModule = () => {
  delete require.cache[MODULE];
  return require("./getLiveSnapshot");
};

const steamAnswer = (count) => ({
  ok: true,
  status: 200,
  json: async () => ({ response: { player_count: count } }),
});

beforeEach(() => {
  delete process.env.PUBG_API_KEY;
  delete process.env.PUBG_SEASON_END_AT;
  delete process.env.PUBG_SEASON_END_DATE;
});

afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...realEnv };
  delete require.cache[MODULE];
});

test("a Steam outage does not take the season countdown down with it", async () => {
  global.fetch = async () => { throw new TypeError("fetch failed"); };
  const { getLiveSnapshot } = freshModule();

  const snapshot = await getLiveSnapshot();

  assert.equal(snapshot.playersOnline.value, null, "the reading that failed says so");
  assert.ok(snapshot.season, "the reading that did not fail is still served");
  assert.ok(snapshot.updatedAt);
});

test("a player count still lands when the season lookup is the one that fails", async () => {
  process.env.PUBG_API_KEY = "test-key";
  global.fetch = async (url) => {
    if (String(url).includes("api.pubg.com")) throw new Error("PUBG API error: 429");
    return steamAnswer(412345);
  };
  const { getLiveSnapshot } = freshModule();

  const snapshot = await getLiveSnapshot();

  assert.equal(snapshot.playersOnline.value, 412345);
  assert.equal(snapshot.season.id, null);
});

// Documented in CLAUDE.md as "optional override for the live-snapshot
// countdown", but it sat last in the fallback chain behind both the API and the
// committed JSON, so it could never override anything.
test("PUBG_SEASON_END_AT overrides the dates it is documented to override", async () => {
  process.env.PUBG_SEASON_END_AT = "2027-01-15T00:00:00.000Z";
  global.fetch = async () => steamAnswer(1);
  const { getLiveSnapshot } = freshModule();

  const snapshot = await getLiveSnapshot();

  assert.equal(snapshot.season.endDate, "2027-01-15T00:00:00.000Z");
  assert.equal(snapshot.season.countdownSource, "env");
  assert.equal(snapshot.season.isEstimated, false);
});

// The case the override exists for: PUBG is already answering with a date, and
// it is the wrong one. Sitting last in the chain, the env var could only ever
// apply when there was nothing to override.
test("the override beats a date PUBG itself is serving", async () => {
  process.env.PUBG_API_KEY = "test-key";
  process.env.PUBG_SEASON_END_AT = "2027-01-15T00:00:00.000Z";
  global.fetch = async (url) => {
    if (!String(url).includes("api.pubg.com")) return steamAnswer(1);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [{
          id: "division.bro.official.pc-2018-43",
          attributes: { isCurrentSeason: true, endDate: "2026-12-01T00:00:00.000Z" },
        }],
      }),
    };
  };
  const { getLiveSnapshot } = freshModule();

  const snapshot = await getLiveSnapshot();

  assert.equal(snapshot.season.endDate, "2027-01-15T00:00:00.000Z");
  assert.equal(snapshot.season.countdownSource, "env");
});

test("PUBG_SEASON_END_DATE is honoured the same way", async () => {
  process.env.PUBG_SEASON_END_DATE = "2027-02-20T00:00:00.000Z";
  global.fetch = async () => steamAnswer(1);
  const { getLiveSnapshot } = freshModule();

  const snapshot = await getLiveSnapshot();

  assert.equal(snapshot.season.endDate, "2027-02-20T00:00:00.000Z");
  assert.equal(snapshot.season.countdownSource, "env");
});

test("an unparseable override is ignored rather than blanking the countdown", async () => {
  process.env.PUBG_SEASON_END_AT = "next tuesday";
  global.fetch = async () => steamAnswer(1);
  const { getLiveSnapshot } = freshModule();

  const snapshot = await getLiveSnapshot();

  assert.notEqual(snapshot.season.countdownSource, "env");
});
