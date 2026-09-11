// Where one player's RP sits in the census sample.
//
// The endpoint ships 101 RP thresholds, highest first, so the index a player's
// RP lands on is already their "top n%" -- no arithmetic, just a lookup. The
// table is built server-side from one reading per account over the pooled
// window, which is why this stays a pure function of the two.

// Never 0 and never 100. Being above every sampled player does not make someone
// the top 0%, and the sample cannot resolve the difference anyway.
const BEST = 1;
const WORST = 99;

export const rpPercentile = (rankPoint, thresholds) => {
  if (!Array.isArray(thresholds) || thresholds.length < 2) return null;

  // Guarded before Number(), which reads null and "" as 0 -- a player with no
  // ranked reading would otherwise be placed at the bottom of the ladder
  // instead of left alone.
  if (rankPoint === null || rankPoint === undefined || rankPoint === "") return null;
  const rp = Number(rankPoint);
  if (!Number.isFinite(rp)) return null;

  const found = thresholds.findIndex((threshold) => Number(threshold) <= rp);
  const at = found === -1 ? thresholds.length - 1 : found;

  return Math.min(WORST, Math.max(BEST, at));
};

// The cuts the page prints, as "above N% of sampled players".
//
// Upward, and that is not only a wording preference: counted downward the
// bottom of the ladder has to be called "top 99%", which is not a phrase
// anybody uses and reads worst for the players it reads worst for.
//
// Nine rather than a hundred and one. At a design effect of three to six a
// one-point step is finer than this sample resolves, and 101 rows is a data
// dump rather than an answer.
export const RP_CUTS = [99, 95, 90, 75, 50, 25, 10, 5, 1];

// "above N% of players" is the top (100 - N)%, and the table is indexed by
// exactly that -- index 0 being the highest reading in the sample. Written as a
// fraction of the last index rather than as `100 - above` so the arithmetic
// does not silently depend on the table being exactly 101 long.
export const rpCuts = (table) => {
  if (!Array.isArray(table) || table.length < 2) return [];
  const last = table.length - 1;
  return RP_CUTS.map((above) => ({
    above,
    rp: table[Math.round(((100 - above) / 100) * last)],
  }));
};

// The one reading the page leads with. Derived from the cuts rather than
// indexed again, so the lead sentence and the table's middle row cannot
// disagree.
export const rpMedian = (table) => {
  const median = rpCuts(table).find((cut) => cut.above === 50);
  return median ? median.rp : null;
};

export default rpPercentile;
