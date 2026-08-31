const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractRankedInfo, buildRankBadgeData } = require("./ranked");

// One mode's ranked stats, shaped the way the PUBG API sends them.
const mode = (tier, subTier, currentRankPoint = 0) => ({
  currentTier: subTier === null ? { tier } : { tier, subTier: String(subTier) },
  currentRankPoint,
  bestRankPoint: currentRankPoint,
  roundsPlayed: 10,
});

// Which tier extractRankedInfo picks as the player's headline when two modes
// disagree -- the same comparison that orders the byMode list. Tier names come
// back lower-cased, so the comparison follows.
const higherOf = (a, b) =>
  extractRankedInfo({ "squad-fpp": a, solo: b }).tier.toLowerCase();

// PUBG's ladder, lowest first, as the Season 42 reward table lists it. Crystal
// sits between Platinum and Diamond because the Season 36 dev letter puts it
// there. Grandmaster is deliberately absent: it was a tier in the 2018 ranked
// beta and in nothing since, so pinning it here would assert a rung the game
// does not have.
const LADDER = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Crystal",
  "Diamond",
  "Master",
  "Survivor",
];

test("orders every adjacent pair of tiers the way the ladder does", () => {
  for (let i = 0; i < LADDER.length - 1; i += 1) {
    const lower = LADDER[i];
    const higher = LADDER[i + 1];
    // The best division of the lower tier against the worst of the higher one:
    // the tightest pair, and the one a tier score gets wrong first.
    assert.equal(
      higherOf(mode(lower, 1), mode(higher, 4)),
      higher.toLowerCase(),
      `${higher} IV should outrank ${lower} I`,
    );
  }
});

test("keeps Crystal below Diamond and Master", () => {
  // The regression this file exists for. Crystal scored 55 against Diamond's 50,
  // and the division bonus pushed Crystal I to 64 -- above Master's 60. A
  // Crystal player's card claimed they were the better of the two.
  assert.equal(higherOf(mode("Crystal", 1), mode("Diamond", 4)), "diamond");
  assert.equal(higherOf(mode("Crystal", 1), mode("Master", null)), "master");
  assert.equal(higherOf(mode("Crystal", 4), mode("Platinum", 1)), "crystal");
});

test("ranks divisions within a tier, I highest", () => {
  assert.equal(higherOf(mode("Crystal", 4), mode("Crystal", 1)), "crystal");
  const info = extractRankedInfo({
    "squad-fpp": mode("Crystal", 4),
    solo: mode("Crystal", 1),
  });
  assert.equal(info.subTier, "1");
});

test("breaks a tie on rank points", () => {
  const info = extractRankedInfo({
    "squad-fpp": mode("Diamond", 2, 3100),
    solo: mode("Diamond", 2, 3400),
  });
  assert.equal(info.currentRankPoint, 3400);
});

test("gives Crystal its own badge art for every division", () => {
  for (const sub of [1, 2, 3, 4]) {
    assert.equal(
      buildRankBadgeData("Crystal", String(sub)).iconUrl,
      `/images/ranks/opgg/crystal-${sub}.webp`,
    );
  }
});
