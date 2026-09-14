const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPacer, LIMIT, RESERVE, MAX_RESERVE } = require("./pacer");

const pacer = (over = {}) => createPacer({ now: () => 0, ...over });

test("lets the first call through immediately", () => {
  assert.equal(pacer().delayBefore(0), 0);
});

// The key is shared with the live site, which spends four or five calls on one
// cold player lookup. The census must leave that headroom rather than sprinting
// to the ceiling.
test("waits for the window to reset once the reserve is reached", () => {
  const p = pacer();
  p.observe({ remaining: RESERVE, resetAt: 30 });
  const delay = p.delayBefore(0);
  assert.ok(delay > 0, "should have waited");
  assert.ok(delay <= 31_000, `waited ${delay}ms, expected to stop at the reset`);
});

test("keeps going while there is headroom above the reserve", () => {
  const p = pacer();
  p.observe({ remaining: RESERVE + 20, resetAt: 30 });
  assert.equal(p.delayBefore(0), 0);
});

test("paces itself below its own ceiling even with quota to spare", () => {
  const p = pacer({ now: () => 0 });
  p.observe({ remaining: 99, resetAt: 60 });
  let now = 0;
  let calls = 0;
  // Walk a minute of virtual time, taking every turn offered.
  while (now < 60_000) {
    const delay = p.delayBefore(now);
    now += delay;
    if (now >= 60_000) break;
    p.record(now);
    calls += 1;
  }
  assert.ok(calls <= LIMIT, `made ${calls} calls in a minute, ceiling is ${LIMIT}`);
  assert.ok(calls >= LIMIT - 2, `only made ${calls}, expected to use its allowance`);
});

// A 429 means the live site and the census together crossed the line. Sleeping
// to the reset is the only response that actually clears it.
test("sleeps until the window resets after a 429", () => {
  const p = pacer();
  p.rateLimited({ resetAt: 45 });
  const delay = p.delayBefore(0);
  assert.ok(delay >= 45_000, `waited only ${delay}ms`);
});

test("falls back to a whole window when a 429 carries no reset", () => {
  const p = pacer();
  p.rateLimited({});
  assert.ok(p.delayBefore(0) >= 60_000);
});

// An earlier design raised the reserve on every 429 and never lowered it. Three
// of them strangled the run to a standstill, and it reported success.
test("the reserve backs off but is capped", () => {
  const p = pacer();
  for (let i = 0; i < 10; i += 1) p.rateLimited({ resetAt: 1 });
  assert.ok(p.reserve() <= MAX_RESERVE, `reserve ran away to ${p.reserve()}`);
});

test("the reserve recovers once calls start succeeding again", () => {
  const p = pacer();
  p.rateLimited({ resetAt: 1 });
  const raised = p.reserve();
  assert.ok(raised > RESERVE);
  for (let i = 0; i < 200; i += 1) p.record(i * 100);
  assert.ok(p.reserve() < raised, `reserve stuck at ${p.reserve()}`);
  assert.ok(p.reserve() >= RESERVE);
});

// Better to stop and say so than to spend four hours making no progress and
// report a partial result as if it were a measurement.
test("gives up when it cannot finish what is left in the time it has", () => {
  const p = pacer();
  assert.equal(p.shouldAbort({ remainingCalls: 100, msLeft: 10 * 60_000 }), false);
  assert.equal(p.shouldAbort({ remainingCalls: 100_000, msLeft: 60_000 }), true);
});

test("does not give up when there is nothing left to do", () => {
  assert.equal(pacer().shouldAbort({ remainingCalls: 0, msLeft: 0 }), false);
});

// `remaining` only ever falls: record() decrements it and a 429 zeroes it. Only
// a response header puts it back, and header() returns undefined for a header
// PUBG did not send. Without a rollover the pacer sits below the reserve with a
// reset already in the past and answers a whole window before EVERY call -- one
// observation a minute for the rest of the hour, while shouldAbort measures
// against LIMIT and so never notices.
test("does not stay blocked once the reset it was told about has passed", () => {
  const p = pacer();
  p.rateLimited({ resetAt: 60 });
  assert.equal(p.delayBefore(61_000), 0);
});

test("keeps going when responses stop carrying a rate-limit header", () => {
  const p = pacer();
  for (let i = 0; i < 80; i += 1) {
    const at = i * 1_100;
    p.delayBefore(at);
    p.record(at);
    p.observe({ remaining: undefined, resetAt: undefined });
  }
  assert.equal(p.delayBefore(90_000), 0);
});

// Recovering the estimate must not become a way round the ceiling that holds
// CEILING - LIMIT back for the live site.
test("its own ceiling still binds after the window has rolled over", () => {
  const p = pacer();
  p.rateLimited({ resetAt: 60 });
  for (let i = 0; i < LIMIT; i += 1) p.record(61_000);
  assert.ok(p.delayBefore(61_000) > 0, "spent more than its own ceiling in one window");
});

// A reset still in the future is real information and must still be obeyed.
test("still waits out a reset that has not arrived yet", () => {
  const p = pacer();
  p.observe({ remaining: 0, resetAt: 120 });
  assert.ok(p.delayBefore(60_000) > 0);
});

test("reports what it did so a run can be judged", () => {
  const p = pacer();
  p.record(0);
  p.record(1);
  p.rateLimited({ resetAt: 1 });
  const stats = p.stats();
  assert.equal(stats.calls, 2);
  assert.equal(stats.rateLimited, 1);
});
