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

const build = (over = {}) => createCensusController({
  collect: async () => collected(),
  readWindow: async () => [],
  readCoverage: async () => ({ matches: 0, accounts: 0, windows: 0, firstDate: null, lastDate: null }),
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
