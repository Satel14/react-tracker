const { test } = require("node:test");
const assert = require("node:assert/strict");
const { collect, sampleWindowStart } = require("./collector");

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

// --- incremental storage -------------------------------------------------
//
// The first scheduled run spent ~1900 metered calls and stored nothing: the
// collector accumulated everything in memory and handed it over in one batch at
// the very end, and the run never reached the end. Anything that survives the
// run has to be written while it is still going.

const { FLUSH_EVERY } = require("./collector");

const competitive = (n) => Array(n).fill("competitive");

test("writes while the run is going rather than once at the end", async () => {
  // Seven lobbies at fifteen players each is 105 observations -- one full batch
  // and a remainder. Storing at the end would be a single call of 105.
  const api = fakeApi({ matchTypes: competitive(7) });
  const batches = [];
  await run(api, { onObservations: async (rows) => { batches.push(rows.length); return rows.length; } });

  assert.equal(batches.length, 2, `expected a flush mid-run, got batches ${JSON.stringify(batches)}`);
  assert.equal(batches[0], FLUSH_EVERY);
  assert.equal(batches[1], 105 - FLUSH_EVERY);
});

test("every observation is handed to the store exactly once", async () => {
  const api = fakeApi({ matchTypes: competitive(7) });
  const seen = [];
  const result = await run(api, { onObservations: async (rows) => { seen.push(...rows); return rows.length; } });

  assert.equal(seen.length, result.observations.length);
  assert.equal(new Set(seen.map((r) => r.accountId)).size, seen.length, "an account was flushed twice");
});

test("does not bother the store with an empty final batch", async () => {
  // Six lobbies is exactly 90 -- under one batch, so there is a remainder to
  // flush. Five would be 75. Either way the store must never see zero rows.
  const api = fakeApi({ matchTypes: competitive(6) });
  const batches = [];
  await run(api, { onObservations: async (rows) => { batches.push(rows.length); return rows.length; } });

  assert.ok(batches.length > 0, "nothing was flushed at all");
  assert.ok(batches.every((n) => n > 0), `an empty batch was flushed: ${JSON.stringify(batches)}`);
});

test("reports how many rows the store actually kept", async () => {
  const api = fakeApi({ matchTypes: competitive(7) });
  // The store dedupes by account, so it keeps fewer rows than it is offered.
  const result = await run(api, { onObservations: async (rows) => rows.length - 1 });

  assert.equal(result.stored, 103, "stored should sum what the store reported, not what was offered");
});

// Neon drops idle connections and a batch can fail on its own. Losing one batch
// is a dent in a sample; losing the run because of it is an hour of quota.
test("a store that fails does not take the run down with it", async () => {
  const api = fakeApi({ matchTypes: competitive(7) });
  let call = 0;
  const result = await run(api, {
    onObservations: async (rows) => {
      call += 1;
      if (call === 1) throw new Error("connection terminated unexpectedly");
      return rows.length;
    },
  });

  assert.equal(call, 2, "the second batch must still be attempted");
  assert.equal(result.stored, 5, "only the batch that landed counts");
  assert.equal(result.observations.length, 105, "the run itself finished");
});

test("runs fine with no store attached", async () => {
  const api = fakeApi({ matchTypes: competitive(2) });
  const result = await run(api);
  assert.equal(result.observations.length, 30);
  assert.equal(result.stored, 0);
});

// The runner turns this into the status a poller reads. Without it a wedged run
// and a working one look identical from outside.
test("reports progress as it goes so a stuck run is visible", async () => {
  const api = fakeApi({ matchTypes: competitive(3) });
  const updates = [];
  await run(api, { onProgress: (p) => updates.push({ ...p }) });

  assert.ok(updates.length > 1, "progress should be reported more than once");
  const last = updates[updates.length - 1];
  assert.equal(last.matchesSeen, 3);
  assert.equal(last.rankedMatches, 3);
  assert.equal(last.observed, 45);
});

// --- the sample window ---
//
// PUBG buckets its sample by calendar day, so the filter picks a DAY, not a
// moment. The first version subtracted 26 hours from "now", which meant the day
// it landed on depended on the hour the job happened to fire. GitHub's
// scheduler once fired 4h54m late and the run silently collected a different
// day than the one before it.

const at = (iso) => Date.parse(iso);

test("the window is a fixed calendar day, not an offset from now", () => {
  assert.equal(sampleWindowStart(at("2026-09-01T05:04:00Z")), "2026-08-30T12:00:00Z");
});

test("the hour the run fires does not move the window", () => {
  const early = sampleWindowStart(at("2026-09-01T00:10:00Z"));
  const late = sampleWindowStart(at("2026-09-01T05:04:00Z"));
  const latest = sampleWindowStart(at("2026-09-01T23:50:00Z"));

  assert.equal(early, late, "a run delayed by five hours must ask for the same day");
  assert.equal(late, latest, "even a run delayed most of a day must ask for the same day");
});

test("the window never sits inside PUBG's 24-hour cutoff", () => {
  // Asking for anything under a day old answers HTTP 400. The earliest a run
  // can fire is midnight, and that is the case with the least margin.
  for (const hour of ["00:00:00", "06:00:00", "12:00:00", "23:59:59"]) {
    const fired = at(`2026-09-01T${hour}Z`);
    const hoursBack = (fired - Date.parse(sampleWindowStart(fired))) / 3600e3;
    assert.ok(hoursBack >= 36, `fired at ${hour}, window only ${hoursBack}h back`);
    assert.ok(hoursBack <= 60, `fired at ${hour}, window ${hoursBack}h back is needlessly stale`);
  }
});

test("the window steps back across a month boundary", () => {
  assert.equal(sampleWindowStart(at("2026-09-01T12:00:00Z")), "2026-08-30T12:00:00Z");
  assert.equal(sampleWindowStart(at("2026-03-01T12:00:00Z")), "2026-02-27T12:00:00Z");
});
