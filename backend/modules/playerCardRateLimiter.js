const { rateLimit } = require("express-rate-limit");

// Every miss on this route costs a full parsePlayerRank -- four or five PUBG
// calls against a key measured at 100 a minute and shared with the live site --
// and the failures are not cached, so an unknown handle costs the same every
// time it is asked for. It is also the only route a third party embeds, so it
// is the one most likely to be hit in a loop.
const createPlayerCardLimiter = (options = {}) =>
  rateLimit({
    windowMs: options.windowMs ?? 60 * 1000,
    limit: options.limit ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many card requests from this IP, please try again later.",
  });

const playerCardLimiter = createPlayerCardLimiter();

module.exports = { createPlayerCardLimiter, playerCardLimiter };
