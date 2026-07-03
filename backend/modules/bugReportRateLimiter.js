const { rateLimit } = require("express-rate-limit");

const createBugReportLimiter = (options = {}) =>
  rateLimit({
    windowMs: options.windowMs ?? 60 * 60 * 1000,
    limit: options.limit ?? 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      message: "Too many bug reports from this IP, please try again later.",
    },
  });

const bugReportLimiter = createBugReportLimiter();

module.exports = { createBugReportLimiter, bugReportLimiter };
