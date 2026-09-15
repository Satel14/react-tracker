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
// Health is per store, not per process. Four stores report here and each caller
// asks about its own: RP history writes fire and forget on every player lookup,
// so they are much the likeliest to fail, and one shared flag would make the
// census page answer no-store and rebuild ~12k rows for every visitor -- the
// transfer blowout its six-hour cache exists to prevent. /healthz still asks
// about the process, and any failing store answers for it.
//
// Order comes from a counter, not from Date.now(): a failure and a recovery can
// land in the same millisecond, and comparing timestamps would then report
// whichever way the tie fell rather than what actually happened last.
let seq = 0;
const stores = new Map();

const UNKNOWN_SCOPE = "unknown";

function storeFor(scope) {
  const key = scope || UNKNOWN_SCOPE;
  let store = stores.get(key);
  if (!store) {
    store = { scope: key, errorSeq: 0, okSeq: 0, lastError: null, lastErrorAt: 0, lastOkAt: 0 };
    stores.set(key, store);
  }
  return store;
}

const failing = (store) => store.errorSeq > store.okSeq;

function recordDbError(scope, message) {
  const store = storeFor(scope);
  seq += 1;
  store.errorSeq = seq;
  store.lastError = message ? String(message) : "unknown Postgres failure";
  store.lastErrorAt = Date.now();
}

function recordDbOk(scope) {
  const store = storeFor(scope);
  seq += 1;
  store.okSeq = seq;
  store.lastOkAt = Date.now();
}

// The last thing that happened to this store was a failure. Not "has ever
// failed": a store that recovers has to be able to say so, or every fallback
// keyed on this would stay switched on for the life of the process.
//
// With no scope the question is about the process, and any failing store
// answers it -- that is what /healthz reports.
function isDbFailing(scope) {
  if (scope) {
    const store = stores.get(scope);
    return store ? failing(store) : false;
  }
  return [...stores.values()].some(failing);
}

function getDbErrorSequence(scope) {
  return stores.get(scope || UNKNOWN_SCOPE)?.errorSeq ?? 0;
}

function getDbHealth() {
  if (!stores.size) return { status: "unknown" };

  // The most recent event of its kind, so /healthz names the store that last
  // had something to say rather than whichever was registered first.
  const latest = (candidates, key) =>
    candidates.reduce((best, store) => (!best || store[key] > best[key] ? store : best), null);

  const broken = [...stores.values()].filter(failing);
  if (broken.length) {
    const worst = latest(broken, "errorSeq");
    return {
      status: "failing",
      scope: worst.scope,
      error: worst.lastError,
      at: new Date(worst.lastErrorAt).toISOString(),
      lastOkAt: worst.lastOkAt ? new Date(worst.lastOkAt).toISOString() : null,
      failing: broken.map((store) => store.scope),
    };
  }

  const healthy = latest([...stores.values()], "okSeq");
  return { status: "ok", scope: healthy.scope, at: new Date(healthy.lastOkAt).toISOString() };
}

function __resetDbHealth() {
  seq = 0;
  stores.clear();
}

module.exports = { recordDbError, recordDbOk, isDbFailing, getDbErrorSequence, getDbHealth, __resetDbHealth };
