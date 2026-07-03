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
    return { origin: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    },
  };
}

module.exports = { parseAllowedOrigins, createCorsOptions };
