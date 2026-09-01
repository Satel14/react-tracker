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

export default rpPercentile;
