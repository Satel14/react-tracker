// What a player of each tier actually does in a ranked match.
//
// Built from the rows readWindow already returns, so it costs no query and no
// Neon transfer of its own -- the same arrangement as lobbyMix.js beside it.
//
// What the rows are: DISTINCT ON (account_id) keeps one row per sampled ACCOUNT
// over the window, its most recent day, carrying the one lobby that account was
// drawn into that day. So every player contributes exactly one match and nobody
// is counted twice -- but the account itself was drawn from a match, so this is
// activity-weighted. It answers "what did the player in a random ranked lobby
// seat do", not "what does the average PUBG player do". The page says so.

const { tierMean, tierShare } = require("./stats");
const { estimateIccNumeric } = require("./sampling");
const { LADDER } = require("./lobbyMix");

// Below this many sampled accounts an average is an anecdote however tight its
// interval looks, and below thirty lobbies the correlation estimate that widens
// that interval is itself noise. Both are raw counts on purpose: they are
// metric-independent, so the whole row is present or absent as one thing. An
// effective-n gate would bind differently per column and put some cells on the
// page and not others, which is a row of dashes under another name.
const MIN_ACCOUNTS = 100;
const MIN_LOBBIES = 30;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// How far above the bottom of the lobby a finish sat: 1 for a win, 0 for last.
//
// The correctness decision of this file. winPlace is a TEAM's place out of ~16
// in squad and a PLAYER's out of ~64 in solo, so pooling raw places across
// modes averages two different quantities into a plausible-looking number that
// measures nothing. The roster count comes from the same match payload, so
// normalising is free.
const placementAbove = (row) => {
  const teams = num(row?.rosterCount);
  const place = num(row?.winPlace);
  if (teams === null || place === null) return null;
  if (teams < 2 || place < 1 || place > teams) return null;
  return (teams - place) / (teams - 1);
};

const minutesAlive = (row) => {
  const seconds = num(row?.timeSurvived);
  return seconds === null ? null : seconds / 60;
};

const METRICS = [
  ["damage", (row) => num(row?.damage)],
  ["kills", (row) => num(row?.kills)],
  ["minutesAlive", minutesAlive],
  ["placement", placementAbove],
];

// What one metric's own sample looks like: the rows that actually reported it,
// the lobbies those rows came from, and how big a cluster that makes.
//
// Kish's mean cluster size for unequal clusters, sum(m^2)/sum(m), not the simple
// average sum(m)/k. The sizes here are uneven by nature -- a lobby yields one
// seat of a common tier and three of another -- and the simple average
// understates the correction exactly where the clustering is worst.
const sampleOf = (rows, valueOf) => {
  const byLobby = new Map();
  const values = [];
  for (const row of rows) {
    const value = valueOf(row);
    if (value === null) continue;
    values.push(value);
    const key = row?.matchId ?? null;
    if (key !== null) byLobby.set(key, (byLobby.get(key) ?? 0) + 1);
  }

  const sizes = [...byLobby.values()];
  const total = sizes.reduce((sum, m) => sum + m, 0);
  const clusterSize = total ? sizes.reduce((sum, m) => sum + m * m, 0) / total : 1;
  const valid = rows.filter((row) => valueOf(row) !== null);

  return { values, valid, lobbies: byLobby.size, clusterSize };
};

const benchmarks = (rows) => {
  const byTier = new Map();
  for (const row of rows ?? []) {
    const tier = row?.tier ? String(row.tier).toLowerCase() : null;
    // No unranked row. "What does an unplaced player do in a match" is a
    // question about the days after a reset, not about the ladder.
    if (!tier || !LADDER.includes(tier)) continue;
    const bucket = byTier.get(tier) ?? [];
    bucket.push(row);
    byTier.set(tier, bucket);
  }

  return LADDER.filter((tier) => byTier.has(tier)).map((tier) => {
    const tierRows = byTier.get(tier);
    const metrics = {};
    // Every published metric has to stand on its own sample. A row written
    // before these columns existed reports none of them, so counting rows
    // instead would publish an average computed from a single match.
    let enough = true;

    for (const [key, valueOf] of METRICS) {
      const { values, valid, lobbies, clusterSize } = sampleOf(tierRows, valueOf);
      metrics[key] = {
        ...tierMean({ values, clusterSize, icc: estimateIccNumeric(valid, valueOf) }),
        lobbies,
        clusterSize,
      };
      if (values.length < MIN_ACCOUNTS || lobbies < MIN_LOBBIES) enough = false;
    }

    // A proportion, so it takes the Wilson path every published share takes.
    // Its denominator is the matches that REPORTED a kill count, not every
    // sampled match: an unreported field is not a match without kills.
    const noKills = (row) => (num(row?.kills) === null ? null : num(row.kills) === 0 ? 1 : 0);
    const kills = sampleOf(tierRows, noKills);
    metrics.noKillShare = {
      // tierShare returns a `publishable` of its own, computed from
      // MIN_EFFECTIVE and MIN_SIGHTINGS. It is deliberately NOT what decides
      // this row -- the row gate below is one decision for the whole table.
      ...tierShare({
        successes: kills.values.filter((value) => value === 1).length,
        n: kills.values.length,
        clusterSize: kills.clusterSize,
        icc: estimateIccNumeric(kills.valid, noKills),
      }),
      lobbies: kills.lobbies,
      clusterSize: kills.clusterSize,
    };
    if (kills.values.length < MIN_ACCOUNTS || kills.lobbies < MIN_LOBBIES) enough = false;

    return {
      tier,
      // Every sampled account of this tier, whether or not it reported a
      // metric. This is what the gated line quotes, because "we have seen 70
      // Masters" is the true and useful sentence -- not how many of those 70
      // happened to carry a column.
      accounts: tierRows.length,
      lobbies: metrics.damage.lobbies,
      publishable: enough,
      metrics,
    };
  });
};

module.exports = { benchmarks, placementAbove, sampleOf, MIN_ACCOUNTS, MIN_LOBBIES };
