// How fast the census is allowed to go.
//
// The PUBG key is shared with the live site, which spends four or five calls on
// one cold player lookup. A census that sprinted to the ceiling would answer
// "Rate Limit Reached" to a real visitor, so this holds a reserve back and never
// touches it.
//
// It also has to fail loudly. An earlier sketch raised the reserve on every 429
// and never lowered it: three of them strangled the run to a standstill and it
// still reported success. So the back-off decays, it is capped, and there is an
// explicit abort when the work left cannot fit the time left.

// The measured ceiling on this key (X-Ratelimit-Limit: 100). Kept as a constant
// rather than read from the header so a header change cannot silently raise it.
const CEILING = 100;

// What the census gives itself. The gap to the ceiling is what the live site
// gets, and 45 calls a minute is roughly nine cold player lookups.
const LIMIT = 55;

// Never spend the last of the window. Below this many remaining, stop and wait
// for the reset even if the local ceiling would allow another call.
const RESERVE = 40;

// The back-off cannot climb past this, or the run makes no progress at all.
const MAX_RESERVE = 60;

const WINDOW_MS = 60_000;
const RESERVE_STEP = 5;
// One step of back-off is repaid after this many clean calls.
const RECOVERY_CALLS = 60;

const createPacer = ({ now = Date.now } = {}) => {
  const recent = [];
  let reserve = RESERVE;
  let cleanCalls = 0;
  // Two different things, conflated once and it stalled the pacer on every
  // response: when the upstream window rolls over, versus when a 429 says we
  // may not call at all.
  let windowResetAt = 0;
  let blockedUntil = 0;
  let remaining = CEILING;
  let calls = 0;
  let rateLimitedCount = 0;

  const prune = (at) => {
    while (recent.length && recent[0] <= at - WINDOW_MS) recent.shift();
  };

  return {
    // How long to sleep before the next metered call.
    delayBefore(at = now()) {
      if (blockedUntil > at) return blockedUntil - at;
      prune(at);

      // The upstream counter says the window is nearly spent -- wait it out
      // rather than take the calls a visitor might need.
      if (remaining <= reserve) {
        return windowResetAt > at ? windowResetAt - at : WINDOW_MS;
      }

      // Our own ceiling: the oldest call in the window has to age out first.
      if (recent.length >= LIMIT) return recent[0] + WINDOW_MS - at;

      return 0;
    },

    record(at = now()) {
      prune(at);
      recent.push(at);
      calls += 1;
      remaining = Math.max(0, remaining - 1);
      cleanCalls += 1;
      if (cleanCalls >= RECOVERY_CALLS && reserve > RESERVE) {
        reserve = Math.max(RESERVE, reserve - RESERVE_STEP);
        cleanCalls = 0;
      }
    },

    // Fed from X-Ratelimit-Remaining / X-Ratelimit-Reset. resetAt is epoch
    // SECONDS, which is what the API sends.
    observe({ remaining: left, resetAt }) {
      if (Number.isFinite(left)) remaining = left;
      if (Number.isFinite(resetAt)) windowResetAt = resetAt * 1000;
    },

    rateLimited({ resetAt } = {}) {
      rateLimitedCount += 1;
      cleanCalls = 0;
      reserve = Math.min(MAX_RESERVE, reserve + RESERVE_STEP);
      blockedUntil = Number.isFinite(resetAt) ? resetAt * 1000 : now() + WINDOW_MS;
      windowResetAt = blockedUntil;
      remaining = 0;
    },

    // Stopping and saying so beats spending the whole budget to produce a
    // fraction of a sample and calling it a measurement.
    shouldAbort({ remainingCalls, msLeft }) {
      if (!remainingCalls) return false;
      const achievable = (msLeft / WINDOW_MS) * LIMIT;
      return remainingCalls > achievable;
    },

    reserve: () => reserve,
    stats: () => ({ calls, rateLimited: rateLimitedCount, reserve }),
  };
};

module.exports = { createPacer, CEILING, LIMIT, RESERVE, MAX_RESERVE, WINDOW_MS };
