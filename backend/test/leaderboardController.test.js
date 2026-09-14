const test = require("node:test");
const assert = require("node:assert");
const LeaderboardController = require("../controllers/leaderboard");

test("exposes the six game modes", () => {
  assert.deepStrictEqual(
    LeaderboardController.GAME_MODES,
    ["solo", "solo-fpp", "duo", "duo-fpp", "squad", "squad-fpp"]
  );
});

test("validate('getLeaderboard') returns a non-empty validation chain", () => {
  const chain = LeaderboardController.validate("getLeaderboard");
  assert.ok(Array.isArray(chain));
  assert.ok(chain.length >= 2);
});

// ?season= is part of the cache key and of the upstream URL, and every novel
// value spends a PUBG request from the same key the live site uses -- one that
// can trip the shared rate-limit cooldown rank lookups read.
test("an unshaped season is rejected rather than spent on a PUBG request", async () => {
  const { validationResult } = require("express-validator");
  const run = async (season) => {
    const req = { params: { platform: "pc-eu", gameMode: "squad" }, query: { season } };
    for (const chain of LeaderboardController.validate("getLeaderboard")) await chain.run(req);
    return validationResult(req).isEmpty();
  };

  assert.strictEqual(await run("division.bro.official.pc-2018-42"), true, "a real season id must pass");
  assert.strictEqual(await run("../../../etc/passwd"), false);
  assert.strictEqual(await run("x".repeat(200)), false);
  assert.strictEqual(await run("whatever-42"), false);
});

test("no season at all is still the default, not an error", async () => {
  const { validationResult } = require("express-validator");
  const req = { params: { platform: "pc-eu", gameMode: "squad" }, query: {} };
  for (const chain of LeaderboardController.validate("getLeaderboard")) await chain.run(req);
  assert.strictEqual(validationResult(req).isEmpty(), true);
});

test("validate(unknown) returns an empty array", () => {
  assert.deepStrictEqual(LeaderboardController.validate("nope"), []);
});
