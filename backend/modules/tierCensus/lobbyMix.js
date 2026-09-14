// Who a player of a given tier actually shares a ranked lobby with.
//
// Built from the rows readWindow already returns, so this costs no query and no
// Neon transfer of its own. It also cannot contradict the published tier
// shares, because it is a second reading of the same observations.
//
// Know what those rows are before trusting a pair drawn from them. readWindow
// selects DISTINCT ON (account_id): one row per sampled ACCOUNT over the whole
// window, keeping its most recent day. That is a sample of accounts, not a full
// lobby roster. An account seen on Monday and again on Friday survives only in
// Friday's lobby, so the older days of a window lose seats -- and the seats they
// lose are the repeat-sampled, which is to say the more active, accounts. The
// shares below are therefore a lower bound on how often a tier meets a tier,
// worst for the oldest day in the window.
//
// Kept that way deliberately. The dedup is what stops tierShare weighting the
// distribution by how much a person plays, so measuring real rosters means a
// second ~12k-row read, and the Neon transfer allowance ran out once already
// (2026-09-10) and took every Postgres-backed feature blank with it for days.
//
// The trap this file exists to avoid is the one stats.js warns about, one level
// deeper. Every pair of players inside a lobby is a pair BECAUSE they were
// matched together, so 2,000 pairs drawn from 300 lobbies are 300 independent
// witnesses to what a lobby looks like, not 2,000. The point estimate uses
// every pair; the interval is computed at the lobby count. That is the same
// division of labour as tierShare's "the point estimate uses every observation;
// only the interval is discounted".

const { wilson, MIN_EFFECTIVE } = require("./stats");

// Mirrors RANK_LADDER in frontend/src/helpers/rankLadder.js. Hand-typed on both
// sides -- neither can import the other -- and lobbyMix.test.js pins the order.
const LADDER = ["bronze", "silver", "gold", "platinum", "crystal", "diamond", "master", "survivor"];

// A player who has not queued ranked this season and turned up in a ranked
// lobby anyway. A real opponent, so a real column; never a row, because "what
// does an unplaced player's lobby look like" is a question about the days after
// a reset rather than about the ladder.
const UNRANKED = "unranked";

// A row stands on the number of LOBBIES behind it, not the number of players.
// Same bar as a published tier share, read against the discounted sample.
// stats.js's MIN_SIGHTINGS is deliberately not applied on top: a row needs
// thirty lobbies, and thirty lobbies cannot hold fewer than thirty players of
// the tier that put them there, so the sightings gate can only ever be
// satisfied already. A second gate that can never fire is dead code.
const ROW_MIN_LOBBIES = MIN_EFFECTIVE;

const bucketOf = (tier) => (tier ? String(tier).toLowerCase() : UNRANKED);

const lobbyMix = (rows) => {
  const byLobby = new Map();
  for (const row of rows ?? []) {
    if (!row?.matchId) continue;
    const bucket = byLobby.get(row.matchId) ?? [];
    bucket.push(bucketOf(row.tier));
    byLobby.set(row.matchId, bucket);
  }

  // focals: how many players of this tier we sampled.
  // lobbies: how many DIFFERENT lobbies they came from -- the discounted n.
  // counts: opponent tier -> observations.
  const tally = new Map();
  const seat = (tier) => {
    if (!tally.has(tier)) tally.set(tier, { focals: 0, lobbies: new Set(), counts: new Map() });
    return tally.get(tier);
  };

  for (const [lobbyId, seats] of byLobby) {
    // One pass per lobby: every seat's opponents are the lobby's own tally
    // minus that seat. Cheaper than the pairwise loop and identical in result.
    const inLobby = new Map();
    for (const tier of seats) inLobby.set(tier, (inLobby.get(tier) ?? 0) + 1);

    // A lobby only witnesses what a tier's lobby looks like if it actually
    // produced an opponent observation for that tier -- a lobby thinned down
    // to a single sampled seat has nothing to say and must not narrow the
    // interval as if it had.
    const witnessed = new Set();

    for (const tier of seats) {
      if (tier === UNRANKED) continue;
      const entry = seat(tier);
      entry.focals += 1;
      for (const [other, count] of inLobby) {
        // An opponent absent from both the ladder and UNRANKED gets no column
        // in the published mix, so it must not get a silent vote in the
        // denominator either -- otherwise every named share comes out
        // deflated by however many of these there were.
        if (other !== UNRANKED && !LADDER.includes(other)) continue;
        const opponents = other === tier ? count - 1 : count;
        if (opponents > 0) {
          entry.counts.set(other, (entry.counts.get(other) ?? 0) + opponents);
          witnessed.add(tier);
        }
      }
    }

    for (const tier of witnessed) seat(tier).lobbies.add(lobbyId);
  }

  return LADDER.filter((tier) => tally.has(tier)).map((tier) => {
    const { focals, lobbies, counts } = tally.get(tier);
    const opponents = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const n = lobbies.size;

    const mix = [...LADDER, UNRANKED]
      .filter((other) => counts.has(other))
      .map((other) => {
        const count = counts.get(other);
        const share = opponents ? count / opponents : 0;
        // Successes scaled with the sample so the interval is centred on the
        // proportion it is reported for -- the same move tierShare makes.
        const { low, high } = wilson({ successes: share * n, n });
        return { tier: other, count, share, low, high };
      });

    // Enough lobbies is necessary but not sufficient: a row with no opponents
    // at all (every lobby held exactly one sampled player of this tier) has
    // nothing to publish a mix for.
    const publishable = n >= ROW_MIN_LOBBIES && opponents > 0;

    return { tier, lobbies: n, focals, opponents, publishable, mix };
  });
};

module.exports = { lobbyMix, LADDER, UNRANKED, ROW_MIN_LOBBIES };
