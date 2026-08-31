const { test } = require("node:test");
const assert = require("node:assert/strict");
const { collect } = require("./collector");

const SEASON = "division.bro.official.pc-2018-42";
const account = (i) => `account.${String(i).padStart(32, "0")}`;

// A fake PUBG that answers from a script, records what was asked, and never
// sleeps -- the pacer's delays are handed to an injected sleep.
const fakeApi = ({ matchTypes = [], ranked = () => "gold", fail = () => null } = {}) => {
  const asked = [];
  const ids = matchTypes.map((_, i) => `match-${i}`);
  return {
    asked,
    ids,
    fetch: async (url) => {
      asked.push(url);
      const forced = fail(url);
      if (forced) return forced;

      if (url.includes("/samples")) {
        return {
          status: 200,
          headers: new Map(),
          json: async () => ({
            data: {
              attributes: { createdAt: "2026-08-30T00:00:00Z" },
              relationships: { matches: { data: ids.map((id) => ({ id })) } },
            },
          }),
        };
      }

      if (url.includes("/matches/")) {
        const index = ids.indexOf(url.split("/matches/")[1]);
        return {
          status: 200,
          headers: new Map(),
          json: async () => ({
            data: { id: ids[index], attributes: { matchType: matchTypes[index], gameMode: "squad" } },
            included: Array.from({ length: 60 }, (_, p) => ({
              type: "participant",
              attributes: { stats: { playerId: account(index * 100 + p) } },
            })),
          }),
        };
      }

      // ranked lookup
      const tier = ranked(url);
      return {
        status: 200,
        headers: new Map([["x-ratelimit-remaining", "90"], ["x-ratelimit-reset", "9999999999"]]),
        json: async () => ({
          data: {
            attributes: {
              rankedGameModeStats: tier
                ? { squad: { currentTier: { tier, subTier: "2" }, currentRankPoint: 2400 } }
                : {},
            },
          },
        }),
      };
    },
  };
};

const run = (api, over = {}) =>
  collect({
    shard: "steam",
    seasonId: SEASON,
    apiKey: "k",
    fetch: api.fetch,
    sleep: async () => {},
    now: () => 0,
    deadlineMs: 90 * 60_000,
    ...over,
  });

test("classifies the sample and only measures ranked matches", async () => {
  const api = fakeApi({ matchTypes: ["official", "competitive", "airoyale", "competitive"] });
  const result = await run(api);
  assert.equal(result.matchesSeen, 4);
  assert.equal(result.rankedMatches, 2);
  const rankedLookups = api.asked.filter((u) => u.includes("/ranked"));
  assert.ok(rankedLookups.length > 0);
});

// Classifying matches is free -- /matches carries no rate-limit headers and
// does not move the counter. Only /samples and the per-player ranked reads are
// metered, which is why every match gets classified and only 15 players per
// ranked lobby get measured.
test("draws a bounded sample from each ranked lobby, not the whole thing", async () => {
  const api = fakeApi({ matchTypes: ["competitive"] });
  const result = await run(api);
  assert.equal(result.observations.length, 15);
  assert.ok(result.observations.length < 60);
});

test("records the match each observation came from", async () => {
  const api = fakeApi({ matchTypes: ["competitive"] });
  const result = await run(api);
  for (const row of result.observations) {
    assert.equal(row.matchId, "match-0");
    assert.equal(row.shard, "steam");
    assert.equal(row.seasonId, SEASON);
  }
});

test("dates observations by the sample window, not by the clock", async () => {
  const api = fakeApi({ matchTypes: ["competitive"] });
  const result = await run(api);
  assert.equal(result.windowDate, "2026-08-30");
  assert.ok(result.observations.every((r) => r.windowDate === "2026-08-30"));
});

// A player who has not queued ranked this season returns 200 with no stats. The
// sample cannot show an unranked bucket if those are silently dropped, so they
// are kept with a null tier and counted.
test("keeps a player who has no ranked stats, with no tier", async () => {
  const api = fakeApi({
    matchTypes: ["competitive"],
    ranked: (url) => (url.includes(account(3)) ? null : "gold"),
  });
  const result = await run(api);
  const untiered = result.observations.filter((r) => r.tier === null);
  assert.ok(untiered.length <= 1);
  assert.equal(result.observations.length, 15, "an untiered player is still an observation");
});

test("normalises the tier to lower case so it joins the ladder", async () => {
  const api = fakeApi({ matchTypes: ["competitive"], ranked: () => "Crystal" });
  const result = await run(api);
  assert.ok(result.observations.every((r) => r.tier === "crystal"));
});

test("survives a match that will not load", async () => {
  const api = fakeApi({
    matchTypes: ["competitive", "competitive"],
    fail: (url) => (url.includes("match-0") ? { status: 503, headers: new Map(), json: async () => ({}) } : null),
  });
  const result = await run(api);
  assert.equal(result.rankedMatches, 1);
  assert.equal(result.matchesFailed, 1);
});

test("survives a player lookup that will not load", async () => {
  let first = true;
  const api = fakeApi({
    matchTypes: ["competitive"],
    fail: (url) => {
      if (!url.includes("/ranked") || !first) return null;
      first = false;
      return { status: 500, headers: new Map(), json: async () => ({}) };
    },
  });
  const result = await run(api);
  assert.equal(result.playersFailed, 1);
  assert.equal(result.observations.length, 14);
});

// Failures are not random -- they cluster where the rate limit bites -- so the
// page has to be able to say how many there were.
test("reports its own failures rather than hiding them", async () => {
  const api = fakeApi({ matchTypes: ["competitive"] });
  const result = await run(api);
  assert.equal(typeof result.matchesFailed, "number");
  assert.equal(typeof result.playersFailed, "number");
  assert.equal(typeof result.rateLimited, "number");
});

test("backs off instead of hammering when the API says slow down", async () => {
  let sent = 0;
  const api = fakeApi({
    matchTypes: ["competitive"],
    fail: (url) => {
      if (!url.includes("/ranked")) return null;
      sent += 1;
      return sent === 1
        ? { status: 429, headers: new Map([["x-ratelimit-reset", "1"]]), json: async () => ({}) }
        : null;
    },
  });
  const slept = [];
  const result = await run(api, { sleep: async (ms) => slept.push(ms) });
  assert.equal(result.rateLimited, 1);
  assert.ok(slept.some((ms) => ms > 0), "never slept after a 429");
});

test("an empty sample is a result, not a crash", async () => {
  const api = fakeApi({ matchTypes: [] });
  const result = await run(api);
  assert.equal(result.rankedMatches, 0);
  assert.deepEqual(result.observations, []);
});

test("stops early rather than overrun the time it was given", async () => {
  const api = fakeApi({ matchTypes: Array(200).fill("competitive") });
  const result = await run(api, { deadlineMs: 1 });
  assert.equal(result.aborted, true);
  assert.ok(result.observations.length < 200 * 15);
});
