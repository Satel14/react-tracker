const test = require("node:test");
const assert = require("node:assert");

const { createParsePlayerRank } = require("../modules/playerRank/parsePlayerRank");
const {
  inFlightRankRequests,
  inFlightResolveRequests,
} = require("../modules/playerRank/state");

// A lone high surrogate makes encodeURIComponent throw synchronously, which is the
// only way to reach the in-flight bookkeeping before the first await.
const MALFORMED_ID = "Bad\uD800";

const { parsePlayerRank, resolvePlayerBatch } = createParsePlayerRank({
  pubgApiKey: "test-key",
  steamApiKey: null,
});

test("a batch resolve that throws before its first await leaves no in-flight entry", async () => {
  inFlightResolveRequests.clear();

  await assert.rejects(
    () => resolvePlayerBatch("steam", [MALFORMED_ID, "Other"]),
    /URI malformed/
  );

  assert.strictEqual(inFlightResolveRequests.size, 0);
});

test("repeated malformed batch resolves do not accumulate in-flight entries", async () => {
  inFlightResolveRequests.clear();

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      () => resolvePlayerBatch("steam", [`${MALFORMED_ID}${i}`, `Other${i}`]),
      /URI malformed/
    );
  }

  assert.strictEqual(inFlightResolveRequests.size, 0);
});

test("a rank lookup that throws before its first await leaves no in-flight entry", async () => {
  inFlightRankRequests.clear();

  await assert.rejects(() => parsePlayerRank("steam", MALFORMED_ID), /URI malformed/);

  assert.strictEqual(inFlightRankRequests.size, 0);
});
