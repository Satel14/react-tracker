process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_key";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCensusController } = require("../controllers/census");

const TOKEN = "a-census-token";

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

const collected = (over = {}) => ({
  windowDate: "2026-08-30", matchesSeen: 1100, rankedMatches: 124, matchesFailed: 3,
  playersFailed: 2, observations: new Array(1860), stored: 1858, calls: 1861,
  rateLimited: 0, aborted: false, ...over,
});

const SEASON = "division.bro.official.pc-2018-42";

const coverage = (over = {}) => ({
  matches: 0, accounts: 0, windows: 0, firstDate: null, lastDate: null, ...over,
});

const build = (over = {}) => createCensusController({
  collect: async () => collected(),
  readWindow: async () => [],
  readCoverage: async () => coverage(),
  readLatestSeason: async () => null,
  readRankPoints: async () => [],
  currentSeason: async () => SEASON,
  token: () => TOKEN,
  ...over,
});

const authed = { headers: { authorization: `Bearer ${TOKEN}` } };

test("an unauthorised run request is a 404 and never reaches the collector", async () => {
  let called = false;
  const controller = build({ collect: async () => { called = true; return collected(); } });
  const res = makeRes();

  await controller.runCensus({ headers: {} }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(called, false);
});

test("an unset token shuts the route rather than opening it", async () => {
  const controller = build({ token: () => undefined });
  const res = makeRes();
  await controller.runCensus(authed, res);
  assert.equal(res.statusCode, 404);
});

// The point of the rewrite. Render's proxy closes the connection at thirty
// minutes and a run takes longer, so the response cannot wait for the result.
test("the run request is answered while the collection is still going", async () => {
  const gate = deferred();
  const controller = build({ collect: () => gate.promise });
  const res = makeRes();

  await controller.runCensus(authed, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.started, true);
  assert.ok(res.body.data.runId, "the poller needs a run id");

  gate.resolve(collected());
  await controller.__idle();
});

test("a second run request does not start a second collection", async () => {
  const gate = deferred();
  let calls = 0;
  const controller = build({ collect: () => { calls += 1; return gate.promise; } });

  await controller.runCensus(authed, makeRes());
  const second = makeRes();
  await controller.runCensus(authed, second);

  assert.equal(second.body.data.started, false);
  assert.match(second.body.data.reason, /already running/i);
  assert.equal(calls, 1);

  gate.resolve(collected());
  await controller.__idle();
});

test("status is idle before anything has run", async () => {
  const res = makeRes();
  await build().getStatus(authed, res);
  assert.equal(res.body.data.state, "idle");
});

test("status is not public -- it would leak that the route exists", async () => {
  const res = makeRes();
  await build().getStatus({ headers: {} }, res);
  assert.equal(res.statusCode, 404);
});

test("status carries the finished run so the job can judge it", async () => {
  const controller = build();
  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  const res = makeRes();
  await controller.getStatus(authed, res);

  assert.equal(res.body.data.state, "done");
  assert.equal(res.body.data.result.windowDate, "2026-08-30");
  assert.equal(res.body.data.result.stored, 1858);
  assert.equal(res.body.data.result.rankedMatches, 124);
});

// A failure has to be visible to the job, not swallowed into a cheerful 200.
test("status reports a run that failed", async () => {
  const controller = build({ collect: async () => { throw new Error("no season"); } });
  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  const res = makeRes();
  await controller.getStatus(authed, res);
  assert.equal(res.body.data.state, "error");
  assert.match(res.body.data.message, /no season/);
});

test("the run result does not ship the raw observations", async () => {
  const controller = build();
  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  const res = makeRes();
  await controller.getStatus(authed, res);
  assert.equal(res.body.data.result.observations, undefined,
    "1860 rows have no business in a status poll");
  assert.equal(res.body.data.result.observed, 1860, "but the count does");
});

test("the distribution stays public and keeps its envelope", async () => {
  const controller = build({
    readWindow: async () => ([
      { matchId: "m1", tier: "gold" }, { matchId: "m1", tier: "gold" },
      { matchId: "m2", tier: "platinum" }, { matchId: "m2", tier: null },
    ]),
    readCoverage: async () => ({ matches: 2, accounts: 4, windows: 1, firstDate: "2026-08-30", lastDate: "2026-08-30" }),
  });
  const res = makeRes();

  await controller.getDistribution({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.accounts, 4);
  assert.equal(res.body.data.matches, 2);
  const tiers = Object.fromEntries(res.body.data.tiers.map((t) => [t.tier, t.count]));
  assert.deepEqual(tiers, { gold: 2, platinum: 1, unranked: 1 });
});

test("a thin sample is not published as if it were a measurement", async () => {
  const controller = build({
    readWindow: async () => ([{ matchId: "m1", tier: "gold" }]),
    readCoverage: async () => ({ matches: 1, accounts: 1, windows: 1, firstDate: "2026-08-30", lastDate: "2026-08-30" }),
  });
  const res = makeRes();

  await controller.getDistribution({ query: {} }, res);

  assert.equal(res.body.data.tiers[0].publishable, false);
});

// --- not spending an hour on a day we already have ---

test("the run hands the collector a way to check the window against the store", async () => {
  let options = null;
  const asked = [];
  const controller = build({
    collect: async (o) => { options = o; return collected(); },
    windowCollected: async (q) => { asked.push(q); return true; },
  });

  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  assert.equal(typeof options.windowCollected, "function", "no guard was passed down");
  assert.equal(await options.windowCollected("2026-08-30"), true);
  assert.deepEqual(asked, [{
    shard: "steam",
    seasonId: "division.bro.official.pc-2018-42",
    windowDate: "2026-08-30",
  }], "the guard has to name the shard and season it is asking about");
});

test("a skipped run says so instead of looking like an empty one", async () => {
  const controller = build({
    collect: async () => collected({
      matchesSeen: 0, rankedMatches: 0, observations: [], stored: 0, calls: 1, skipped: true,
    }),
  });

  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  const res = makeRes();
  await controller.getStatus(authed, res);
  assert.equal(res.body.data.state, "done");
  assert.equal(res.body.data.result.skipped, true);
  assert.equal(res.body.data.result.stored, 0);
});

test("an ordinary run is not reported as skipped", async () => {
  const controller = build();
  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  const res = makeRes();
  await controller.getStatus(authed, res);
  assert.equal(res.body.data.result.skipped, false);
});

// --- which season the census is about ---
//
// It was a hardcoded id with an env override. Ranked resets roughly every
// three months, and the first reset would have had the collector writing the
// new season's tiers into the old season's bucket while the page went on
// serving the old one for ever.

test("collects into the season PUBG says is current", async () => {
  let options = null;
  const controller = build({
    collect: async (o) => { options = o; return collected(); },
    currentSeason: async () => "division.bro.official.pc-2018-43",
  });

  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  assert.equal(options.seasonId, "division.bro.official.pc-2018-43");
});

// The escape hatch. If PUBG's own catalog is ever wrong about which season is
// current, this is what fixes it without a deploy.
test("an explicit override beats the catalog", async () => {
  const previous = process.env.PUBG_CENSUS_SEASON;
  process.env.PUBG_CENSUS_SEASON = "division.bro.official.pc-2018-41";
  try {
    let options = null;
    const controller = build({
      collect: async (o) => { options = o; return collected(); },
      currentSeason: async () => "division.bro.official.pc-2018-43",
    });

    await controller.runCensus(authed, makeRes());
    await controller.__idle();

    assert.equal(options.seasonId, "division.bro.official.pc-2018-41");
  } finally {
    if (previous === undefined) delete process.env.PUBG_CENSUS_SEASON;
    else process.env.PUBG_CENSUS_SEASON = previous;
  }
});

// A catalog lookup that fails is not worth an hour of quota. The last known
// season is wrong for at most one run, and a run is what fixes it.
test("a catalog that cannot answer does not stop the run", async () => {
  let options = null;
  const controller = build({
    collect: async (o) => { options = o; return collected(); },
    currentSeason: async () => { throw new Error("PUBG API error: 503"); },
  });

  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  assert.ok(options, "the run should still have started");
  assert.match(options.seasonId, /^division\.bro\.official\.pc-\d{4}-\d+$/);
});

test("asks the catalog once for the run, not once per player", async () => {
  let asked = 0;
  const controller = build({
    currentSeason: async () => { asked += 1; return SEASON; },
  });

  await controller.runCensus(authed, makeRes());
  await controller.__idle();

  assert.equal(asked, 1);
});

// --- what the page reads across a season boundary ---

test("serves the current season once it has enough days behind it", async () => {
  const controller = build({
    currentSeason: async () => "division.bro.official.pc-2018-43",
    readCoverage: async () => coverage({ windows: 4, matches: 500, firstDate: "2026-09-10", lastDate: "2026-09-13" }),
    readLatestSeason: async () => "division.bro.official.pc-2018-42",
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);

  assert.equal(res.body.data.seasonId, "division.bro.official.pc-2018-43");
  assert.equal(res.body.data.current, true);
});

// The first days of a season are a real measurement of a transient state:
// almost nobody has placed. As an answer to "where do players sit" it misleads,
// so the finished season stands until the new one has three days behind it.
test("a season too new to mean anything falls back to the last one with data", async () => {
  const asked = [];
  const controller = build({
    currentSeason: async () => "division.bro.official.pc-2018-43",
    readCoverage: async ({ seasonId }) => {
      asked.push(seasonId);
      return seasonId === "division.bro.official.pc-2018-43"
        ? coverage({ windows: 1, matches: 90 })
        : coverage({ windows: 7, matches: 900, firstDate: "2026-09-02", lastDate: "2026-09-08" });
    },
    readLatestSeason: async () => "division.bro.official.pc-2018-42",
    readWindow: async () => [{ matchId: "m1", tier: "gold" }],
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);

  assert.equal(res.body.data.seasonId, "division.bro.official.pc-2018-42");
  assert.equal(res.body.data.current, false, "the page has to be able to say so");
  assert.deepEqual(asked, ["division.bro.official.pc-2018-43", "division.bro.official.pc-2018-42"]);
});

test("does not fall back when there is nothing older to fall back to", async () => {
  const controller = build({
    currentSeason: async () => "division.bro.official.pc-2018-43",
    readCoverage: async () => coverage({ windows: 1 }),
    readLatestSeason: async () => null,
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);

  assert.equal(res.body.data.seasonId, "division.bro.official.pc-2018-43");
  assert.equal(res.body.data.current, true);
});

test("does not fall back onto the season it is already serving", async () => {
  let coverageCalls = 0;
  const controller = build({
    currentSeason: async () => SEASON,
    readCoverage: async () => { coverageCalls += 1; return coverage({ windows: 2 }); },
    readLatestSeason: async () => SEASON,
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);

  assert.equal(res.body.data.seasonId, SEASON);
  assert.equal(res.body.data.current, true);
  assert.equal(coverageCalls, 1, "the same season must not be read twice");
});

// --- the RP table the player page reads ---

const ladder = (n = 400) => Array.from({ length: n }, (_, i) => 1000 + i * 6);

test("ships the RP standing at each whole percentile", async () => {
  const controller = build({
    readCoverage: async () => coverage({ windows: 7, matches: 300 }),
    readRankPoints: async () => ladder(),
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);

  const table = res.body.data.rpPercentiles;
  assert.equal(table.length, 101);
  assert.ok(table[0] > table[100], "index 0 must be the top of the ladder");
});

test("asks for the rank points of the season it is serving", async () => {
  const asked = [];
  const controller = build({
    currentSeason: async () => "division.bro.official.pc-2018-43",
    readCoverage: async ({ seasonId }) =>
      seasonId.endsWith("43") ? coverage({ windows: 1 }) : coverage({ windows: 7 }),
    readLatestSeason: async () => "division.bro.official.pc-2018-42",
    readRankPoints: async (query) => { asked.push(query); return ladder(); },
  });

  await controller.getDistribution({ query: { days: 7 } }, makeRes());

  // The fallback season, not the current one: a standing has to be measured
  // against the same ladder the page is showing.
  assert.deepEqual(asked, [{ shard: "steam", seasonId: "division.bro.official.pc-2018-42", days: 7 }]);
});

// A sample too thin to cut into percentiles ships no table at all rather than
// one built from a handful of people.
test("ships no table when there is not enough to cut", async () => {
  const controller = build({
    readCoverage: async () => coverage({ windows: 7 }),
    readRankPoints: async () => [2400, 2500, 2600],
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);
  assert.equal(res.body.data.rpPercentiles, null);
});

test("survives a store that cannot answer for the rank points", async () => {
  const controller = build({
    readCoverage: async () => coverage({ windows: 7 }),
    readRankPoints: async () => { throw new Error("connection terminated unexpectedly"); },
  });

  const res = makeRes();
  await controller.getDistribution({ query: {} }, res);

  // The tier bars are the point of this endpoint; the RP table is an extra.
  assert.equal(res.body.status, 200);
  assert.equal(res.body.data.rpPercentiles, null);
  assert.ok(Array.isArray(res.body.data.tiers));
});
