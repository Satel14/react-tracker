const { rateLimit } = require("express-rate-limit");

// Each call asks PUBG about up to three platforms, against a key measured at
// 100 a minute and shared with the live site. A visitor needs one call per
// "not found" page, so ten a minute is far above honest use.
const createPlayerLocateLimiter = (options = {}) =>
  rateLimit({
    windowMs: options.windowMs ?? 60 * 1000,
    limit: options.limit ?? 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message: "Too many lookups from this IP, please try again later." },
  });

const playerLocateLimiter = createPlayerLocateLimiter();

module.exports = { createPlayerLocateLimiter, playerLocateLimiter };
