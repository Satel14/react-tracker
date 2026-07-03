const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  ALLOWED_SHARDS,
  assertShard,
  isAllowedShard,
  isStrictAccountId,
  isValidGameId,
  encodeSegment,
} = require("./pubgUrlSafety");

test("isAllowedShard accepts the known PUBG shards and rejects everything else", () => {
  for (const shard of ["steam", "kakao", "xbox", "xbl", "psn", "stadia", "console"]) {
    assert.equal(isAllowedShard(shard), true);
  }
  assert.equal(isAllowedShard("steam/../../evil"), false);
  assert.equal(isAllowedShard("STEAM"), true); // case-insensitive
  assert.equal(isAllowedShard(""), false);
  assert.equal(isAllowedShard(undefined), false);
});

test("assertShard returns the normalized shard for valid input", () => {
  assert.equal(assertShard("Steam"), "steam");
  assert.equal(assertShard("  psn  "), "psn");
});

test("assertShard throws on an unknown or injected shard", () => {
  assert.throws(() => assertShard("steam/../../secret"), /Invalid shard/);
  assert.throws(() => assertShard("nope"), /Invalid shard/);
  assert.throws(() => assertShard(undefined), /Invalid shard/);
});

test("isStrictAccountId only accepts account.<32 hex>", () => {
  assert.equal(isStrictAccountId("account." + "a".repeat(32)), true);
  assert.equal(isStrictAccountId("account.0123456789abcdef0123456789ABCDEF"), true);
  assert.equal(isStrictAccountId("account.evil/../../secret"), false);
  assert.equal(isStrictAccountId("account.short"), false);
  assert.equal(isStrictAccountId("account." + "a".repeat(33)), false);
  assert.equal(isStrictAccountId("notanaccount"), false);
  assert.equal(isStrictAccountId(42), false);
});

test("isValidGameId enforces a non-empty, length-capped string", () => {
  assert.equal(isValidGameId("shroud"), true);
  assert.equal(isValidGameId(""), false);
  assert.equal(isValidGameId("   "), false);
  assert.equal(isValidGameId("x".repeat(64)), true);
  assert.equal(isValidGameId("x".repeat(65)), false);
  assert.equal(isValidGameId(null), false);
});

test("encodeSegment percent-encodes path-breaking characters", () => {
  assert.equal(encodeSegment("a/b"), "a%2Fb");
  assert.equal(encodeSegment("a b?c#d"), "a%20b%3Fc%23d");
  assert.equal(encodeSegment("account." + "a".repeat(32)), "account." + "a".repeat(32));
});

test("ALLOWED_SHARDS covers the platform shards used to build api.pubg.com URLs", () => {
  assert.deepEqual(
    [...ALLOWED_SHARDS].sort(),
    ["console", "kakao", "psn", "stadia", "steam", "xbl", "xbox"]
  );
});
