"use strict";

// Parse the CORS_ORIGIN env var (comma-separated) into a clean list of origins.
function parseAllowedOrigins(rawValue) {
  if (typeof rawValue !== "string") return [];
  return rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Build the options object passed to the cors() middleware.
// - Unset/blank CORS_ORIGIN -> permissive (reflect any origin) so dev/local keeps working.
// - Otherwise -> only whitelisted origins (plus origin-less requests) are allowed.
function createCorsOptions(rawValue) {
  const allowedOrigins = parseAllowedOrigins(rawValue);

  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "CORS_ORIGIN is not set; reflecting any origin. Set CORS_ORIGIN to a comma-separated whitelist in production."
      );
    }
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Tagged so express's error handler can answer 403 rather than the 500
        // an untagged error reads as.
        const error = new Error(`Origin ${origin} is not allowed by CORS`);
        error.status = 403;
        callback(error);
      }
    },
  };
}

module.exports = { parseAllowedOrigins, createCorsOptions };
