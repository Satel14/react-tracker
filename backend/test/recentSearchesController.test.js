process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_key";

const test = require("node:test");
const assert = require("node:assert");
const PlayerController = require("../controllers/player");

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(name, value) {
      if (typeof name === "object") Object.assign(this.headers, name);
      else this.headers[name] = value;
      return this;
    },
  };
}

test("getRecentSearches responds 200 with a { status, data } envelope", async () => {
  const res = makeRes();
  await PlayerController.getRecentSearches({}, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 200);
  assert.ok(Array.isArray(res.body.data), "expected data to be an array");
});

test("the recent list is never browser-cacheable for a positive duration", async () => {
  const res = makeRes();
  await PlayerController.getRecentSearches({}, res);

  const cacheControl = res.headers["Cache-Control"] || res.headers["cache-control"] || "";
  const maxAge = /max-age=(\d+)/.exec(cacheControl);

  // Regression guard: this list changes as a direct result of the visitor's own
  // search. A max-age of 30 meant the browser served its cached copy and hid
  // their own entry from them for up to half a minute.
  assert.ok(
    !maxAge || Number(maxAge[1]) === 0,
    `Cache-Control must not allow a positive max-age, got "${cacheControl}"`
  );
});
