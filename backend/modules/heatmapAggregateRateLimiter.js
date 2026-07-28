const { rateLimit } = require("express-rate-limit");

const createHeatmapAggregateLimiter = (options = {}) =>
  rateLimit({
    windowMs: options.windowMs ?? 60 * 1000,
    limit: options.limit ?? 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      message: "Too many heatmap requests from this IP, please try again later.",
    },
  });

const heatmapAggregateLimiter = createHeatmapAggregateLimiter();

module.exports = { createHeatmapAggregateLimiter, heatmapAggregateLimiter };
