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

// A value PUBG actually reported, or null. Number(null) and Number("") are both
// 0 and both finite, so the empties have to be refused before the coercion --
// otherwise an unreported field enters a mean as a real zero.
const number = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const whole = (value) => {
  const n = number(value);
  return n === null ? null : Math.round(n);
};

// Everything the match payload already carries about one drawn player.
//
// The collector downloads this payload for every match in PUBG's daily sample
// and /matches is not rate limited, so these fields cost nothing -- they were
// simply thrown away until now. Five of them are published; the rest are stored
// because a column not collected today can never be backfilled (/samples only
// serves recent days) and disk is not what Neon meters.
const participantsFromMatch = (payload) =>
  (payload?.included ?? [])
    .filter((item) => item?.type === "participant")
    .map((item) => item?.attributes?.stats ?? {})
    .filter((stats) => typeof stats.playerId === "string" && ACCOUNT.test(stats.playerId))
    .map((stats) => ({
      accountId: stats.playerId,
      damageDealt: whole(stats.damageDealt),
      kills: number(stats.kills),
      headshotKills: number(stats.headshotKills),
      assists: number(stats.assists),
      dbnos: number(stats.DBNOs),
      revives: number(stats.revives),
      timeSurvived: whole(stats.timeSurvived),
      winPlace: number(stats.winPlace),
      walkDistance: whole(stats.walkDistance),
      rideDistance: whole(stats.rideDistance),
    }));

// How many TEAMS were in the lobby. The denominator that makes a placement
// comparable across modes: winPlace is a team's place out of ~16 in squad and a
// player's out of ~64 in solo, so the raw number means different things.
const rosterCount = (payload) =>
  (payload?.included ?? []).filter((item) => item?.type === "roster").length;

// One parser, so the ids and the performance can never disagree about which
// participants count.
const accountsFromMatch = (payload) => participantsFromMatch(payload).map((p) => p.accountId);

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

// One-way ANOVA estimate of the intra-cluster correlation for a continuous
// value: how much of its variation sits between lobbies rather than within
// them. Same formula as estimateIcc below, which is the 0/1 special case --
// for an indicator, the sum of squared deviations inside a cluster is exactly
// n*p*(1-p).
//
// Rows whose value is null are skipped rather than read as zero: an unreported
// field is not a performance of nothing.
const estimateIccNumeric = (rows, valueOf) => {
  const byMatch = new Map();
  for (const row of rows ?? []) {
    if (!row?.matchId) continue;
    const raw = valueOf(row);
    if (raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const bucket = byMatch.get(row.matchId) ?? [];
    bucket.push(value);
    byMatch.set(row.matchId, bucket);
  }

  const clusters = [...byMatch.values()];
  const k = clusters.length;
  const n = clusters.reduce((sum, c) => sum + c.length, 0);
  if (k < 2 || n <= k) return 0;

  const mean = (c) => c.reduce((sum, v) => sum + v, 0) / c.length;
  const grand = clusters.reduce((sum, c) => sum + c.reduce((s, v) => s + v, 0), 0) / n;

  const between = clusters.reduce((sum, c) => sum + c.length * (mean(c) - grand) ** 2, 0) / (k - 1);
  const within =
    clusters.reduce((sum, c) => {
      const m = mean(c);
      return sum + c.reduce((s, v) => s + (v - m) ** 2, 0);
    }, 0) / (n - k);

  // Average cluster size, corrected for unequal sizes.
  const sumSquares = clusters.reduce((sum, c) => sum + c.length * c.length, 0);
  const m0 = (n - sumSquares / n) / (k - 1);
  if (!(m0 > 0)) return 0;

  const icc = (between - within) / (between + (m0 - 1) * within);
  if (!Number.isFinite(icc)) return 0;
  return Math.min(1, Math.max(0, icc));
};

// One-way ANOVA estimate of the intra-cluster correlation for one tier: how
// much of the variation in "is this player in tier T" sits between lobbies
// rather than within them. Measured from the rows we collected -- never
// assumed, because assuming it is exactly how a published interval ends up
// several times narrower than the data supports.
const estimateIcc = (rows, tier) => estimateIccNumeric(rows, (row) => (row.tier === tier ? 1 : 0));

module.exports = {
  PER_MATCH,
  accountsFromMatch,
  estimateIcc,
  estimateIccNumeric,
  participantsFromMatch,
  pickParticipants,
  rosterCount,
};
