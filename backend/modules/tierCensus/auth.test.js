const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isAuthorised } = require("./auth");

const bearer = (token) => ({ authorization: `Bearer ${token}` });

// The endpoint this guards spends PUBG quota shared with the live site. Left
// open, anyone could drain a day's budget by curling it in a loop.
test("accepts the configured token", () => {
  assert.equal(isAuthorised(bearer("s3cret"), "s3cret"), true);
});

test("rejects a wrong token", () => {
  assert.equal(isAuthorised(bearer("nope"), "s3cret"), false);
});

test("rejects a missing header", () => {
  assert.equal(isAuthorised({}, "s3cret"), false);
  assert.equal(isAuthorised(undefined, "s3cret"), false);
});

test("rejects a header that is not a bearer", () => {
  assert.equal(isAuthorised({ authorization: "s3cret" }, "s3cret"), false);
  assert.equal(isAuthorised({ authorization: "Basic s3cret" }, "s3cret"), false);
});

// An unset CENSUS_TOKEN must close the door, not open it. Defaulting to "no
// token configured means no check" is how an internal endpoint ends up public.
test("refuses everything when no token is configured", () => {
  for (const configured of [undefined, null, ""]) {
    assert.equal(isAuthorised(bearer("anything"), configured), false);
    assert.equal(isAuthorised({}, configured), false);
  }
});

test("does not accept a token that merely starts the same", () => {
  assert.equal(isAuthorised(bearer("s3cretlonger"), "s3cret"), false);
  assert.equal(isAuthorised(bearer("s3cre"), "s3cret"), false);
});

// Comparing with === leaks length and position through timing. The difference
// is small over the internet, but the fix costs nothing.
test("compares in constant time regardless of where the difference is", () => {
  assert.equal(isAuthorised(bearer("a".repeat(43)), "b".repeat(43)), false);
  assert.equal(isAuthorised(bearer(`${"a".repeat(42)}b`), "a".repeat(43)), false);
});

test("tolerates odd whitespace around the scheme", () => {
  assert.equal(isAuthorised({ authorization: "Bearer   s3cret" }, "s3cret"), true);
  assert.equal(isAuthorised({ authorization: "bearer s3cret" }, "s3cret"), true);
});
