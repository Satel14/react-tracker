const { test } = require("node:test");
const assert = require("node:assert/strict");
const { designEffect, effectiveN, wilson, tierShare } = require("./stats");

// Observations arrive in lobbies of ~60 with tier-banded matchmaking, so two
// players from the same match are not two independent draws. Treating them as
// independent is what makes a published interval several times narrower than
// the data supports -- the exact failure this file exists to prevent.
test("design effect is 1 only when observations are independent", () => {
  assert.equal(designEffect({ clusterSize: 15, icc: 0 }), 1);
  assert.equal(designEffect({ clusterSize: 1, icc: 0.3 }), 1);
});

test("design effect grows with both cluster size and correlation", () => {
  // 1 + (m - 1) * rho
  assert.equal(designEffect({ clusterSize: 15, icc: 0.1 }), 1 + 14 * 0.1);
  assert.ok(
    designEffect({ clusterSize: 15, icc: 0.2 }) > designEffect({ clusterSize: 15, icc: 0.1 }),
  );
});

test("effective n shrinks the sample by the design effect", () => {
  // Within one: 1 + 14 * 0.1 lands on 2.4000000000000004 in floating point,
  // and pinning the exact integer would pin that noise rather than the maths.
  const nEff = effectiveN({ n: 3000, clusterSize: 15, icc: 0.1 });
  assert.ok(Math.abs(nEff - 1250) <= 1, `expected ~1250, got ${nEff}`);
  assert.equal(effectiveN({ n: 3000, clusterSize: 15, icc: 0 }), 3000);
});

test("effective n never exceeds the raw count or drops below one cluster", () => {
  assert.equal(effectiveN({ n: 100, clusterSize: 15, icc: -1 }), 100);
  // Perfectly homogeneous lobbies: the sample is worth its cluster count.
  assert.equal(effectiveN({ n: 300, clusterSize: 15, icc: 1 }), 20);
});

test("wilson brackets the point estimate and stays inside 0..1", () => {
  const { low, high } = wilson({ successes: 300, n: 3000 });
  assert.ok(low < 0.1 && high > 0.1, `expected 0.1 inside [${low}, ${high}]`);
  assert.ok(low >= 0 && high <= 1);
});

// Wald is the interval that goes negative at the tail, which is precisely where
// a rank distribution lives -- Master and Survivor are fractions of a percent.
test("wilson stays positive where wald would go negative", () => {
  const { low } = wilson({ successes: 1, n: 150 });
  assert.ok(low > 0, `wilson lower bound went to ${low}`);
});

test("wilson widens as the sample shrinks", () => {
  const big = wilson({ successes: 300, n: 3000 });
  const small = wilson({ successes: 30, n: 300 });
  assert.ok(small.high - small.low > big.high - big.low);
});

test("a tier share is computed on the effective sample, not the raw one", () => {
  const naive = tierShare({ successes: 300, n: 3000, clusterSize: 1, icc: 0 });
  const clustered = tierShare({ successes: 300, n: 3000, clusterSize: 15, icc: 0.1 });
  assert.equal(clustered.share, naive.share);
  const width = (r) => r.high - r.low;
  // The published interval must be materially wider, not cosmetically.
  assert.ok(
    width(clustered) > width(naive) * 1.4,
    `clustered ${width(clustered)} vs naive ${width(naive)}`,
  );
});

test("a tier share reports what it was computed from", () => {
  const result = tierShare({ successes: 300, n: 3000, clusterSize: 15, icc: 0.1 });
  assert.equal(result.n, 3000);
  assert.ok(Math.abs(result.effectiveN - 1250) <= 1);
  assert.ok(result.designEffect > 2 && result.designEffect < 3);
});

test("a share nobody can stand behind is refused rather than rounded", () => {
  // Survivor draws a couple of effective observations at best. Publishing a
  // percentage for it would be inventing precision.
  const thin = tierShare({ successes: 1, n: 3000, clusterSize: 15, icc: 0.3 });
  assert.equal(thin.publishable, false);
  const solid = tierShare({ successes: 300, n: 3000, clusterSize: 15, icc: 0.1 });
  assert.equal(solid.publishable, true);
});

test("an empty sample yields no share at all", () => {
  const none = tierShare({ successes: 0, n: 0, clusterSize: 15, icc: 0.1 });
  assert.equal(none.share, null);
  assert.equal(none.publishable, false);
});

// Found by running the real thing against six live lobbies: a tier seen ONCE
// was reported as publishable, because the gate only looked at the size of the
// whole sample. One sighting cannot carry a percentage however many players
// were measured around it.
test("a tier seen once is not publishable, however large the sample", () => {
  const single = tierShare({ successes: 1, n: 3000, clusterSize: 15, icc: 0 });
  assert.equal(single.publishable, false, "one sighting must not be published as a share");
  assert.ok(single.share > 0, "the share is still computed, just not published");
});

test("publishing needs enough sightings of the tier itself", () => {
  const four = tierShare({ successes: 4, n: 3000, clusterSize: 1, icc: 0 });
  const many = tierShare({ successes: 40, n: 3000, clusterSize: 1, icc: 0 });
  assert.equal(four.publishable, false);
  assert.equal(many.publishable, true);
});
