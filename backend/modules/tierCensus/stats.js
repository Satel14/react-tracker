// The statistics behind the published tier distribution.
//
// The whole point of this page is being more honest than a four-year-old
// competitor, so the arithmetic here is the product. The trap it exists to
// avoid: players are sampled in lobbies of ~60 with tier-banded matchmaking, so
// two observations from one match are not two independent draws. Treating them
// as independent produces an interval several times narrower than the data
// supports -- flattering, and wrong.

// 95%. Not configurable on purpose: a page that quietly widened its confidence
// level to look precise would be doing the thing this file exists to prevent.
const Z = 1.959963984540054;

// Below this many effective observations a percentage is invented precision
// rather than a measurement. Survivor will sit here for a long time, which is
// why it is published from its known slot count instead.
const MIN_EFFECTIVE = 30;

// And the tier must have been SEEN enough, not merely surrounded by a big
// sample. Six live lobbies produced one Diamond player in thirty-six draws and
// the first version of this gate called that publishable, because it only
// looked at the size of the sample as a whole.
const MIN_SIGHTINGS = 5;

// Kish's design effect: how many independent observations one clustered
// observation is worth. m is the cluster size, rho the intra-cluster
// correlation -- both measured from the collected data, never assumed.
const designEffect = ({ clusterSize, icc }) => {
  const m = Math.max(1, Number(clusterSize) || 1);
  const rho = Math.min(1, Math.max(0, Number(icc) || 0));
  return 1 + (m - 1) * rho;
};

const effectiveN = ({ n, clusterSize, icc }) => {
  const raw = Math.max(0, Number(n) || 0);
  if (!raw) return 0;
  const deff = designEffect({ clusterSize, icc });
  // Never inflate past the raw count, and never fall below the number of
  // clusters -- perfectly homogeneous lobbies are worth one observation each,
  // not zero.
  const floor = Math.max(1, Math.floor(raw / Math.max(1, Number(clusterSize) || 1)));
  return Math.min(raw, Math.max(floor, Math.floor(raw / deff)));
};

// Wilson score interval. Wald is the one that goes negative at the tail, which
// is exactly where a rank ladder lives.
const wilson = ({ successes, n }) => {
  const total = Math.max(0, Number(n) || 0);
  if (!total) return { low: 0, high: 0 };
  const p = Math.min(1, Math.max(0, successes / total));
  const z2 = Z * Z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const spread = (Z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return {
    low: Math.max(0, centre - spread),
    high: Math.min(1, centre + spread),
  };
};

// One tier's published share: the point estimate from the full sample, the
// interval from the effective one, and an honest refusal when the effective
// sample cannot carry a percentage.
const tierShare = ({ successes, n, clusterSize, icc }) => {
  const total = Math.max(0, Number(n) || 0);
  const hits = Math.max(0, Number(successes) || 0);
  if (!total) {
    return { share: null, low: null, high: null, n: 0, effectiveN: 0, designEffect: 1, publishable: false };
  }

  const deff = designEffect({ clusterSize, icc });
  const nEff = effectiveN({ n: total, clusterSize, icc });
  // The point estimate uses every observation; only the interval is discounted.
  const share = hits / total;
  // Scale the successes with the sample so the interval is centred on the same
  // proportion it is reported for.
  const { low, high } = wilson({ successes: share * nEff, n: nEff });

  return {
    share,
    low,
    high,
    n: total,
    effectiveN: nEff,
    designEffect: deff,
    publishable: nEff >= MIN_EFFECTIVE && hits >= MIN_SIGHTINGS && share * nEff >= 1,
  };
};

module.exports = { designEffect, effectiveN, wilson, tierShare, MIN_EFFECTIVE, MIN_SIGHTINGS, Z };
