const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRunner } = require("./runner");

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const result = (over = {}) => ({
  windowDate: "2026-08-30", matchesSeen: 4, rankedMatches: 2, matchesFailed: 0,
  playersFailed: 0, observations: [], stored: 30, calls: 31, rateLimited: 0,
  aborted: false, ...over,
});

const runner = (collect, over = {}) => createRunner({ collect, now: () => 1000, ...over });

// The whole reason this module exists. A run takes 45 minutes; Render's proxy
// closes the connection at 30. Holding the response open until the collection
// finished meant the job could never report its own outcome -- and it never
// did: the first scheduled run came back a 502 and stored nothing.
test("start hands back a run id without waiting for the collection", async () => {
  const gate = deferred();
  const r = runner(() => gate.promise);

  const started = r.start({});

  assert.equal(started.started, true);
  assert.ok(started.runId, "a run needs an id the poller can quote");
  assert.equal(r.status().state, "running", "should be running while collect is still out");

  gate.resolve(result());
  await started.done;
});

test("status reaches done and carries the result", async () => {
  const r = runner(async () => result({ rankedMatches: 7 }));
  await r.start({}).done;

  const status = r.status();
  assert.equal(status.state, "done");
  assert.equal(status.result.rankedMatches, 7);
  assert.equal(status.finishedAt, 1000);
});

test("reports idle before anything has run", () => {
  assert.equal(runner(async () => result()).status().state, "idle");
});

// Two concurrent runs would spend the day's PUBG quota twice for the same rows.
test("refuses to start a second run on top of one already going", async () => {
  const gate = deferred();
  let calls = 0;
  const r = runner(() => { calls += 1; return gate.promise; });

  const first = r.start({});
  const second = r.start({});

  assert.equal(second.started, false);
  assert.match(second.reason, /already running/i);
  assert.equal(calls, 1, "the second start must not reach the collector");
  assert.equal(second.runId, first.runId, "the caller should learn which run is in the way");

  gate.resolve(result());
  await first.done;
});

test("a new run can start once the previous one has finished", async () => {
  const r = runner(async () => result());
  const first = r.start({});
  await first.done;

  const second = r.start({});
  assert.equal(second.started, true);
  assert.notEqual(second.runId, first.runId);
  await second.done;
});

// Nobody awaits the run -- the request that started it has long since been
// answered. An escaping rejection would take the whole API down with it, on
// Node's default unhandled-rejection policy.
test("a collector that throws becomes a status, never an unhandled rejection", async () => {
  const r = runner(async () => { throw new Error("PUBG said no"); });
  const started = r.start({});

  await assert.doesNotReject(() => started.done, "done must never reject; the caller ignores it");

  const status = r.status();
  assert.equal(status.state, "error");
  assert.match(status.message, /PUBG said no/);
});

test("a failed run does not wedge the runner shut", async () => {
  let first = true;
  const r = runner(async () => {
    if (first) { first = false; throw new Error("boom"); }
    return result();
  });
  await r.start({}).done;

  const second = r.start({});
  assert.equal(second.started, true, "a crash must not leave it permanently 'running'");
  await second.done;
  assert.equal(r.status().state, "done");
});

// The poller needs to tell a working run from a wedged one, and a run that is
// storing rows from one that is silently reading nothing.
test("progress from the collector is visible while the run is still going", async () => {
  const gate = deferred();
  let report;
  const r = runner((options) => { report = options.onProgress; return gate.promise; });

  const started = r.start({});
  report({ matchesSeen: 300, rankedMatches: 30, observed: 450, stored: 400 });

  const progress = r.status().progress;
  assert.equal(progress.matchesSeen, 300);
  assert.equal(progress.observed, 450);
  assert.equal(progress.stored, 400);

  gate.resolve(result());
  await started.done;
});

test("passes the caller's options through to the collector", async () => {
  let seen;
  const r = runner(async (options) => { seen = options; return result(); });
  await r.start({ shard: "steam", seasonId: "s-42" }).done;

  assert.equal(seen.shard, "steam");
  assert.equal(seen.seasonId, "s-42");
});

test("timestamps the run so a stuck one can be spotted", async () => {
  const gate = deferred();
  const clock = [100, 100, 900];
  let i = 0;
  const r = createRunner({ collect: () => gate.promise, now: () => clock[Math.min(i++, clock.length - 1)] });

  const started = r.start({});
  assert.equal(r.status().startedAt, 100);

  gate.resolve(result());
  await started.done;
  assert.ok(r.status().finishedAt >= r.status().startedAt);
});
