// Choosing whom to measure, and how much that measurement is worth.
//
// Reading every player of every ranked lobby costs about 2.5x the API calls for
// barely more precision, because the binding constraint is the number of
// LOBBIES -- PUBG's daily sample fixes that at roughly 126 however many players
// we read from each. So take a bounded random draw per match and buy precision
// by pooling days instead.

// Fifteen of a ~63-player lobby. Widens the standard error by about 1.12x
// against reading everyone, and turns a two-and-a-half-hour run into under an
// hour on a key shared with the live site.
const PER_MATCH = 15;

const ACCOUNT = /^account\.[0-9a-f]{32}$/i;

const accountsFromMatch = (payload) =>
  (payload?.included ?? [])
    .filter((item) => item?.type === "participant")
    .map((item) => item?.attributes?.stats?.playerId)
    .filter((id) => typeof id === "string" && ACCOUNT.test(id));

// Partial Fisher-Yates: unbiased, and it stops after PER_MATCH swaps instead of
// shuffling the whole lobby. Taking the head of the list would sample by
// finishing position, since participants arrive in placement order.
const pickParticipants = (ids, random = Math.random, limit = PER_MATCH) => {
  const pool = [...ids];
  const wanted = Math.min(Math.max(1, limit || PER_MATCH), pool.length);
  for (let i = 0; i < wanted; i += 1) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, wanted);
};

// One-way ANOVA estimate of the intra-cluster correlation for one tier: how
// much of the variation in "is this player in tier T" sits between lobbies
// rather than within them. Measured from the rows we collected -- never
// assumed, because assuming it is exactly how a published interval ends up
// several times narrower than the data supports.
const estimateIcc = (rows, tier) => {
  const byMatch = new Map();
  for (const row of rows ?? []) {
    if (!row?.matchId) continue;
    const bucket = byMatch.get(row.matchId) ?? { n: 0, hits: 0 };
    bucket.n += 1;
    if (row.tier === tier) bucket.hits += 1;
    byMatch.set(row.matchId, bucket);
  }

  const clusters = [...byMatch.values()].filter((c) => c.n > 0);
  const k = clusters.length;
  const n = clusters.reduce((sum, c) => sum + c.n, 0);
  if (k < 2 || n <= k) return 0;

  const total = clusters.reduce((sum, c) => sum + c.hits, 0);
  if (!total) return 0;

  const grand = total / n;
  const between = clusters.reduce((sum, c) => sum + c.n * (c.hits / c.n - grand) ** 2, 0) / (k - 1);
  const within =
    clusters.reduce((sum, c) => {
      const p = c.hits / c.n;
      return sum + c.n * p * (1 - p);
    }, 0) / (n - k);

  // Average cluster size, corrected for unequal sizes.
  const sumSquares = clusters.reduce((sum, c) => sum + c.n * c.n, 0);
  const m0 = (n - sumSquares / n) / (k - 1);
  if (!(m0 > 0)) return 0;

  const icc = (between - within) / (between + (m0 - 1) * within);
  if (!Number.isFinite(icc)) return 0;
  return Math.min(1, Math.max(0, icc));
};

module.exports = { PER_MATCH, accountsFromMatch, pickParticipants, estimateIcc };
