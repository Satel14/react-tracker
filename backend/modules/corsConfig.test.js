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

// The error goes to express's error handler, which reads `status` off it. An
// untagged error is a 500, and a caller told "something went wrong" has no way
// to tell a server fault from an origin it was never going to be allowed from.
test("a rejected origin is tagged as a 403, not left to read as a server fault", () => {
  const { origin } = createCorsOptions("https://a.com");
  let result;
  origin("https://evil.com", (err) => { result = err; });
  assert.equal(result.status, 403);
});
