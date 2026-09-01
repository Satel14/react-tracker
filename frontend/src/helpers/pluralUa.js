// Ukrainian counts take three noun forms, and the site's headline numbers land
// in all three: 1 матч, 2 матчі, 8 матчів. English needs none of this, so the
// caller passes the forms and only the Ukrainian copy reaches for them.
export const pluralUa = (count, [one, few, many]) => {
  const n = Math.abs(Number(count));
  if (!Number.isFinite(n)) return many;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};
