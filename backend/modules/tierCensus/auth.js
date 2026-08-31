// The one door into the census run.
//
// Behind it sits a job that spends PUBG quota shared with the live site, so an
// open endpoint would let anyone drain a day's budget with a loop. Two rules
// carry the weight: an unset token closes the door rather than opening it, and
// the comparison does not leak through timing.

const { timingSafeEqual } = require("node:crypto");

const BEARER = /^bearer\s+(.+)$/i;

const constantTimeEqual = (a, b) => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a timing
  // signal -- compare against a same-length copy and fold the length in.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
};

const isAuthorised = (headers, configuredToken) => {
  // No token configured means the endpoint is shut, not that the check is
  // skipped. The other way round is how an internal route ends up public.
  if (!configuredToken) return false;

  const header = headers?.authorization;
  if (typeof header !== "string") return false;

  const match = BEARER.exec(header.trim());
  if (!match) return false;

  return constantTimeEqual(match[1].trim(), configuredToken);
};

module.exports = { isAuthorised };
