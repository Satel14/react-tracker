// Whether Postgres is answering, remembered rather than probed.
//
// Every Postgres-backed store swallows its own errors and answers with nothing,
// because none of them is allowed to break the page it feeds. The price of that
// is a silent outage: on 2026-09-10 this project's monthly Neon transfer
// allowance ran out and recent searches, the tier census and RP history all
// went blank for days -- each one looking exactly like "no data collected yet".
//
// This module is the one place that can tell those two apart. It deliberately
// runs no query of its own: a health check that asked Postgres how it was would
// add load to the very thing it reports on, and /healthz is polled far more
// often than anything else here. It only remembers what the last real query saw.
//
// Order comes from a counter, not from Date.now(): a failure and a recovery can
// land in the same millisecond, and comparing timestamps would then report
// whichever way the tie fell rather than what actually happened last.
let seq = 0;
let errorSeq = 0;
let okSeq = 0;
let lastError = null;
let lastErrorAt = 0;
let lastErrorScope = null;
let lastOkAt = 0;
let lastOkScope = null;

function recordDbError(scope, message) {
  seq += 1;
  errorSeq = seq;
  lastError = message ? String(message) : "unknown Postgres failure";
  lastErrorAt = Date.now();
  lastErrorScope = scope || null;
}

function recordDbOk(scope) {
  seq += 1;
  okSeq = seq;
  lastOkAt = Date.now();
  lastOkScope = scope || null;
}

// The last thing that happened was a failure. Not "has ever failed": a store
// that recovers has to be able to say so, or every fallback keyed on this would
// stay switched on for the life of the process.
function isDbFailing() {
  return errorSeq > okSeq;
}

function getDbHealth() {
  if (!errorSeq && !okSeq) return { status: "unknown" };
  if (isDbFailing()) {
    return {
      status: "failing",
      scope: lastErrorScope,
      error: lastError,
      at: new Date(lastErrorAt).toISOString(),
      lastOkAt: lastOkAt ? new Date(lastOkAt).toISOString() : null,
    };
  }
  return { status: "ok", scope: lastOkScope, at: new Date(lastOkAt).toISOString() };
}

function __resetDbHealth() {
  seq = 0;
  errorSeq = 0;
  okSeq = 0;
  lastError = null;
  lastErrorAt = 0;
  lastErrorScope = null;
  lastOkAt = 0;
  lastOkScope = null;
}

module.exports = { recordDbError, recordDbOk, isDbFailing, getDbHealth, __resetDbHealth };
