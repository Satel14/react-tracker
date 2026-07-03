const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseAllowedOrigins, createCorsOptions } = require("./corsConfig");

test("parseAllowedOrigins splits a comma-separated list and trims blanks", () => {
  assert.deepEqual(
    parseAllowedOrigins("https://a.com, https://b.com ,, https://c.com"),
    ["https://a.com", "https://b.com", "https://c.com"]
  );
});

test("parseAllowedOrigins returns an empty list when unset or blank", () => {
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
  assert.deepEqual(parseAllowedOrigins("   "), []);
});

test("createCorsOptions is permissive (reflect any origin) when CORS_ORIGIN is unset", () => {
  assert.deepEqual(createCorsOptions(undefined), { origin: true });
  assert.deepEqual(createCorsOptions(""), { origin: true });
});

test("createCorsOptions allows a whitelisted origin", () => {
  const { origin } = createCorsOptions("https://a.com,https://b.com");
  let result;
  origin("https://b.com", (err, allowed) => { result = { err, allowed }; });
  assert.equal(result.err, null);
  assert.equal(result.allowed, true);
});

test("createCorsOptions allows requests with no Origin header (curl / server-to-server)", () => {
  const { origin } = createCorsOptions("https://a.com");
  let result;
  origin(undefined, (err, allowed) => { result = { err, allowed }; });
  assert.equal(result.err, null);
  assert.equal(result.allowed, true);
});

test("createCorsOptions rejects an origin that is not whitelisted", () => {
  const { origin } = createCorsOptions("https://a.com");
  let result;
  origin("https://evil.com", (err, allowed) => { result = { err, allowed }; });
  assert.ok(result.err instanceof Error);
  assert.match(result.err.message, /not allowed by CORS/);
  assert.notEqual(result.allowed, true);
});
