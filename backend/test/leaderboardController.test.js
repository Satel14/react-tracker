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
  assert.strictEqual(chain.length, 2);
});

test("validate(unknown) returns an empty array", () => {
  assert.deepStrictEqual(LeaderboardController.validate("nope"), []);
});
