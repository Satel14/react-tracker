const test = require("node:test");
const assert = require("node:assert");
const { mapLeaderboard } = require("../modules/leaderboard/leaderboardMapper");

const sample = {
  data: { type: "leaderboard", attributes: { shardId: "steam", gameMode: "squad-fpp", seasonId: "division.bro.official.pc-2018-30" } },
  included: [
    { type: "player", id: "account.b", attributes: { name: "Bravo", rank: 2, stats: { rankPoints: 5200, games: 80, wins: 9, winRatio: 0.1125, averageDamage: 410.5, kills: 250, kda: 4.1, tier: "Diamond", subTier: "2" } } },
    { type: "player", id: "account.a", attributes: { name: "Alpha", rank: 1, stats: { rankPoints: 6000, games: 100, wins: 20, winRatio: 0.2, averageDamage: 520, kills: 400, kda: 5.5, tier: "Master", subTier: 1 } } },
    { type: "season", id: "ignore-me", attributes: {} },
  ],
};

test("maps included players into flat rows sorted by rank", () => {
  const rows = mapLeaderboard(sample);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].rank, 1);
  assert.strictEqual(rows[0].name, "Alpha");
  assert.strictEqual(rows[0].accountId, "account.a");
  assert.strictEqual(rows[0].rankPoints, 6000);
  assert.strictEqual(rows[0].tier, "Master");
  assert.strictEqual(rows[0].subTier, "1");
  assert.strictEqual(rows[0].tierIconUrl, "/images/ranks/opgg/master-1.png");
  assert.strictEqual(rows[1].tierIconUrl, "/images/ranks/opgg/diamond-2.png");
  assert.strictEqual(rows[1].rank, 2);
  assert.strictEqual(rows[1].name, "Bravo");
});

test("ignores non-player included entries", () => {
  const rows = mapLeaderboard(sample);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every((r) => r.accountId && r.accountId.startsWith("account.")));
});

test("coerces missing stats to safe defaults and tolerates empty input", () => {
  const rows = mapLeaderboard({ included: [{ type: "player", id: "account.x", attributes: { rank: 3 } }] });
  assert.deepStrictEqual(rows[0], {
    rank: 3,
    accountId: "account.x",
    name: "",
    rankPoints: 0,
    tier: "",
    subTier: "",
    tierIconUrl: null,
    tierIconFallbackUrl: null,
    games: 0,
    wins: 0,
    winRatio: 0,
    kda: 0,
    avgDamage: 0,
    avgRank: 0,
    kills: 0,
  });
  assert.deepStrictEqual(mapLeaderboard(null), []);
  assert.deepStrictEqual(mapLeaderboard({}), []);
});
