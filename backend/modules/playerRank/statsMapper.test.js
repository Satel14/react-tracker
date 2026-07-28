const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapPubgStatsToFrontend,
  normalizeRankedModeStats,
  aggregateModeStats,
  combineAggregatedStats,
  RANKED_UNREPORTED_FIELDS,
  MODE_STAT_FIELDS,
} = require("./statsMapper");

test("default profile exposes a stable shape including weaponMastery", () => {
  const { data } = mapPubgStatsToFrontend({ gameModeStats: {} }, "Tester", "account.1");
  assert.equal(data.profile.status, "not_loaded");
  assert.equal(data.profile.banType, null);
  assert.equal(data.profile.clan, null);
  assert.equal(data.profile.survivalMastery, null);
  assert.ok("weaponMastery" in data.profile);
  assert.equal(data.profile.weaponMastery, null);
});

test("provided profileExtras override the default profile", () => {
  const { data } = mapPubgStatsToFrontend(
    { gameModeStats: {} },
    "Tester",
    "account.1",
    null,
    null,
    null,
    null,
    "steam",
    null,
    { profile: { status: "ok", weaponMastery: { total: 3 } }, matches: { summary: { total: 0 }, items: [] } }
  );
  assert.equal(data.profile.status, "ok");
  assert.deepEqual(data.profile.weaponMastery, { total: 3 });
});

const normalGameModeStats = {
  "squad-fpp": {
    kills: 10,
    wins: 2,
    timeSurvived: 3600,
    damageDealt: 1500,
    roundsPlayed: 8,
    headshotKills: 3,
    revives: 1,
    assists: 2,
    dBNOs: 5,
    heals: 4,
    boosts: 6,
    vehicleDestroys: 0,
    roadKills: 0,
    top10s: 5,
    teamKills: 0,
    suicides: 0,
    longestKill: 120,
    longestTimeSurvived: 1200,
  },
};

const rankedGameModeStats = {
  "squad-fpp": {
    currentTier: { tier: "Diamond", subTier: "3" },
    currentRankPoint: 3200,
    playTime: 7200,
    top10Ratio: 0.5,
    roundsPlayed: 10,
    kills: 20,
    wins: 3,
    damageDealt: 4000,
    headshotKills: 6,
    revives: 2,
    assists: 4,
    dBNOs: 8,
    heals: 10,
    boosts: 12,
    teamKills: 1,
    longestKill: 200,
    avgSurvivalTime: 720,
  },
};

test("normalizeRankedModeStats derives top10s from top10Ratio and keeps the fields ranked reports", () => {
  const normalized = normalizeRankedModeStats(rankedGameModeStats);
  const squad = normalized["squad-fpp"];
  assert.equal(squad.top10s, 5); // round(0.5 * 10 roundsPlayed)
  assert.equal(squad.kills, 20);
  assert.equal(squad.wins, 3);
  assert.equal(squad.roundsPlayed, 10);
  assert.equal(squad.damageDealt, 4000);
  assert.equal(squad.assists, 4);
  assert.equal(squad.dBNOs, 8);
});

test("normalizeRankedModeStats emits null for every field the ranked schema cannot report", () => {
  const normalized = normalizeRankedModeStats({
    "squad-fpp": {
      ...rankedGameModeStats["squad-fpp"],
      longestTimeSurvived: 999,
      vehicleDestroys: 9,
      roadKills: 8,
      suicides: 7,
    },
  });
  const squad = normalized["squad-fpp"];
  RANKED_UNREPORTED_FIELDS.forEach((field) => {
    assert.equal(squad[field], null, `${field} must be null, got ${JSON.stringify(squad[field])}`);
  });
});

test("the unreported set matches what normalizeRankedModeStats emits and what aggregation reads", () => {
  const squad = normalizeRankedModeStats(rankedGameModeStats)["squad-fpp"];
  const emitted = Object.keys(squad);
  const nulled = emitted.filter((field) => squad[field] === null);
  const reported = emitted.filter((field) => squad[field] !== null);

  assert.deepEqual(nulled.slice().sort(), RANKED_UNREPORTED_FIELDS.slice().sort());
  reported.forEach((field) => {
    assert.ok(!RANKED_UNREPORTED_FIELDS.includes(field), `${field} is reported but listed as unreported`);
    assert.equal(typeof squad[field], "number", `${field} must be a number`);
  });

  const aggregatedFields = MODE_STAT_FIELDS.map((entry) => entry.field).sort();
  assert.deepEqual(emitted.slice().sort(), aggregatedFields);
});

test("combineAggregatedStats sums reported fields and keeps normal-only ones for the rest", () => {
  const normalAgg = aggregateModeStats(normalGameModeStats);
  const rankedAgg = aggregateModeStats(normalizeRankedModeStats(rankedGameModeStats));
  const combined = combineAggregatedStats(normalAgg, rankedAgg);
  assert.equal(combined.totalTop10s, 10); // 5 + 5
  assert.equal(combined.totalKills, 30); // 10 + 20
  assert.equal(combined.totalMatches, 18); // 8 + 10
  assert.equal(combined.totalWins, 5); // 2 + 3
  assert.equal(combined.totalDamage, 5500); // 1500 + 4000
  assert.equal(combined.totalTime, 3600);
  assert.equal(combined.totalHeadshots, 3);
  assert.equal(combined.maxKillDistance, 120);
});

// Live ranked capture: PUBG populates only kills/deaths/damage/dBNOs/assists/
// wins/roundsPlayed/top10Ratio; every other field comes back as a literal 0.
const liveRankedGameModeStats = {
  squad: {
    currentTier: { tier: "Master", subTier: "0" },
    currentRankPoint: 4123,
    kills: 334,
    deaths: 379,
    damageDealt: 59120,
    dBNOs: 300,
    assists: 74,
    wins: 21,
    roundsPlayed: 374,
    top10Ratio: 0.4,
    headshotKills: 0,
    longestKill: 0,
    playTime: 0,
    revives: 0,
    heals: 0,
    boosts: 0,
    teamKills: 0,
    avgSurvivalTime: 0,
  },
};

const liveNormalGameModeStats = {
  squad: {
    kills: 8,
    wins: 1,
    timeSurvived: 3600,
    damageDealt: 1200,
    roundsPlayed: 5,
    headshotKills: 6,
    revives: 1,
    assists: 2,
    dBNOs: 6,
    heals: 13,
    boosts: 5,
    vehicleDestroys: 0,
    roadKills: 0,
    top10s: 3,
    teamKills: 0,
    suicides: 0,
    longestKill: 64,
    longestTimeSurvived: 1500,
  },
};

function mapSeason(normalModeStats, rankedModeStats) {
  const seasonData = {
    id: "division.bro.official.pc-2018-37",
    attributes: { gameModeStats: normalModeStats || {} },
  };
  const rankedSeasonData = rankedModeStats ? { attributes: { rankedGameModeStats: rankedModeStats } } : null;
  const { data } = mapPubgStatsToFrontend(
    { gameModeStats: normalModeStats || {} },
    "Satel14",
    "account.satel",
    seasonData,
    rankedSeasonData,
    null,
    null,
    "steam",
    null,
    null
  );
  return data.season;
}

test("combined season headshot rate counts only kills from modes that report headshots", () => {
  const season = mapSeason(liveNormalGameModeStats, liveRankedGameModeStats);
  assert.equal(season.stats.headshotRate.value, 75);
  assert.equal(season.stats.headshotRate.displayValue, "75%");
  assert.equal(season.stats.headshotPct.value, 6);
});

test("combined season keeps normal-only values for the fields ranked never reports", () => {
  const season = mapSeason(liveNormalGameModeStats, liveRankedGameModeStats);
  assert.equal(season.stats.timePlayed.displayValue, "1h");
  assert.equal(season.stats.longestKill.displayValue, "64m");
  assert.equal(season.stats.longestSurvival.displayValue, "0h 25m");
  assert.equal(season.stats.heals.displayValue, "13");
  assert.equal(season.stats.boosts.displayValue, "5");
  assert.equal(season.stats.mvp.displayValue, "1");
  assert.equal(season.stats.teamKills.displayValue, "0");
});

test("combined season still sums every field ranked does report", () => {
  const season = mapSeason(liveNormalGameModeStats, liveRankedGameModeStats);
  assert.equal(season.stats.kills.value, 342); // 8 + 334
  assert.equal(season.stats.damage.value, 60320); // 1200 + 59120
  assert.equal(season.stats.wins.value, 22); // 1 + 21
  assert.equal(season.stats.matchesPlayed.value, 379); // 5 + 374
  assert.equal(season.stats.assists.value, 76); // 2 + 74
  assert.equal(season.stats.dbnos.value, 306); // 6 + 300
  assert.equal(season.stats.top10s.value, 153); // 3 + round(0.4 * 374)
});

test("a ranked-only season reports an em dash instead of a zero for unreported fields", () => {
  const season = mapSeason({}, liveRankedGameModeStats);
  const unknownKeys = [
    "headshotRate",
    "headshotPct",
    "timePlayed",
    "longestKill",
    "longestSurvival",
    "mvp",
    "heals",
    "boosts",
    "teamKills",
    "vehicleDestroys",
    "roadKills",
    "suicides",
  ];
  unknownKeys.forEach((key) => {
    assert.equal(season.stats[key].displayValue, "—", `${key} displayValue`);
    assert.equal(season.stats[key].value, null, `${key} value`);
  });

  assert.equal(season.stats.kills.value, 334);
  assert.equal(season.stats.damage.value, 59120);
  assert.equal(season.stats.matchesPlayed.value, 374);
  assert.equal(season.stats.wins.value, 21);
});

test("the ranked breakdown hides unreported fields while the normal breakdown stays intact", () => {
  const season = mapSeason(liveNormalGameModeStats, liveRankedGameModeStats);

  assert.equal(season.breakdown.ranked.headshotRate.displayValue, "—");
  assert.equal(season.breakdown.ranked.timePlayed.displayValue, "—");
  assert.equal(season.breakdown.ranked.longestKill.displayValue, "—");
  assert.equal(season.breakdown.ranked.heals.displayValue, "—");
  assert.equal(season.breakdown.ranked.kills.value, 334);
  assert.equal(season.breakdown.ranked.matchesPlayed.value, 374);

  assert.equal(season.breakdown.normal.headshotRate.displayValue, "75%");
  assert.equal(season.breakdown.normal.timePlayed.displayValue, "1h");
  assert.equal(season.breakdown.normal.longestKill.displayValue, "64m");
  assert.equal(season.breakdown.normal.heals.displayValue, "13");
  assert.equal(season.breakdown.normal.kills.value, 8);
});

test("a normal-only season is byte-for-byte what it was before the ranked fix", () => {
  const season = mapSeason(liveNormalGameModeStats, null);
  assert.equal(season.includesRanked, false);
  assert.deepEqual(season.stats, {
    timePlayed: { displayValue: "1h", value: 3600 },
    kills: { displayValue: "8", value: 8 },
    deaths: { displayValue: "4", value: 4 },
    kd: { displayValue: "2.00", value: 2 },
    wins: { displayValue: "1", value: 1 },
    matchesPlayed: { displayValue: "5", value: 5 },
    roundsPlayed: { displayValue: "5", value: 5 },
    mvp: { displayValue: "1", value: 1 },
    headshotPct: { displayValue: "6", value: 6 },
    headshotRate: { displayValue: "75%", value: 75 },
    damage: { displayValue: (1200).toLocaleString(), value: 1200 },
    avgDamage: { displayValue: "240", value: 240 },
    wlPercentage: { displayValue: "20%", value: 20 },
    top10Rate: { displayValue: "60%", value: 60 },
    killsPerMatch: { displayValue: "1.60", value: 1.6 },
    longestKill: { displayValue: "64m", value: 64 },
    longestSurvival: { displayValue: "0h 25m", value: 1500 },
    assists: { displayValue: "2", value: 2 },
    dbnos: { displayValue: "6", value: 6 },
    top10s: { displayValue: "3", value: 3 },
    heals: { displayValue: "13", value: 13 },
    boosts: { displayValue: "5", value: 5 },
    vehicleDestroys: { displayValue: "0", value: 0 },
    roadKills: { displayValue: "0", value: 0 },
    teamKills: { displayValue: "0", value: 0 },
    suicides: { displayValue: "0", value: 0 },
  });
});

const killlessNormalGameModeStats = {
  squad: {
    kills: 0,
    wins: 0,
    timeSurvived: 1800,
    damageDealt: 320,
    roundsPlayed: 5,
    headshotKills: 0,
    revives: 0,
    assists: 1,
    dBNOs: 0,
    heals: 2,
    boosts: 1,
    vehicleDestroys: 0,
    roadKills: 0,
    top10s: 1,
    teamKills: 0,
    suicides: 0,
    longestKill: 0,
    longestTimeSurvived: 600,
  },
};

test("an empty kill sample makes the headshot rate unknown instead of a measured 0%", () => {
  const season = mapSeason(killlessNormalGameModeStats, liveRankedGameModeStats);
  assert.equal(season.stats.kills.value, 334);
  assert.equal(season.stats.matchesPlayed.value, 379);
  assert.equal(season.stats.headshotRate.displayValue, "—");
  assert.equal(season.stats.headshotRate.value, null);
  assert.equal(season.modes.squad.stats.headshotRate.displayValue, "—");
});

test("a kill-less normal-only season still reports a real 0% headshot rate", () => {
  const season = mapSeason(killlessNormalGameModeStats, null);
  assert.equal(season.stats.kills.value, 0);
  assert.equal(season.stats.headshotRate.displayValue, "0%");
  assert.equal(season.stats.headshotRate.value, 0);
});

test("season.modes applies exactly the same reporting rule as season.stats", () => {
  const season = mapSeason(liveNormalGameModeStats, liveRankedGameModeStats);
  const squad = season.modes.squad.stats;

  assert.equal(squad.headshotRate.displayValue, "75%"); // was 1.8%
  assert.equal(squad.timePlayed.displayValue, "1h");
  assert.equal(squad.heals.displayValue, "13");
  assert.equal(squad.longestKill.displayValue, "64m");
  assert.deepEqual(squad, season.stats);
});

test("season.modes marks unreported fields unknown on a ranked-only season", () => {
  const season = mapSeason({}, liveRankedGameModeStats);
  const squad = season.modes.squad.stats;

  assert.equal(squad.timePlayed.displayValue, "—"); // was "0h" beside season "—"
  assert.equal(squad.headshotRate.displayValue, "—");
  assert.equal(squad.longestKill.displayValue, "—");
  assert.equal(squad.heals.displayValue, "—");
  assert.deepEqual(squad, season.stats);
});

test("ranked's reported fields stay fully combined at season.stats and season.modes", () => {
  const season = mapSeason(liveNormalGameModeStats, liveRankedGameModeStats);
  [season.stats, season.modes.squad.stats].forEach((stats, index) => {
    const where = index === 0 ? "season.stats" : "season.modes.squad";
    assert.equal(stats.kills.value, 342, `${where} kills`);
    assert.equal(stats.wins.value, 22, `${where} wins`);
    assert.equal(stats.damage.value, 60320, `${where} damage`);
    assert.equal(stats.matchesPlayed.value, 379, `${where} matches`);
    assert.equal(stats.assists.value, 76, `${where} assists`);
    assert.equal(stats.dbnos.value, 306, `${where} knockouts`);
    assert.equal(stats.top10s.value, 153, `${where} top10s`);
  });
});

const idleMode = {
  kills: 0,
  wins: 0,
  timeSurvived: 0,
  damageDealt: 0,
  roundsPlayed: 0,
  headshotKills: 0,
  revives: 0,
  assists: 0,
  dBNOs: 0,
  heals: 0,
  boosts: 0,
  vehicleDestroys: 0,
  roadKills: 0,
  top10s: 0,
  teamKills: 0,
  suicides: 0,
  longestKill: 0,
  longestTimeSurvived: 0,
};

test("an unplayed slice's zeros neither erase a measurement nor pass for a report", () => {
  const withIdleMode = mapSeason({ ...liveNormalGameModeStats, solo: idleMode }, liveRankedGameModeStats);
  assert.deepEqual(withIdleMode.stats, mapSeason(liveNormalGameModeStats, liveRankedGameModeStats).stats);
  const rankedOnly = mapSeason({ solo: idleMode }, liveRankedGameModeStats);
  assert.equal(rankedOnly.stats.timePlayed.displayValue, "—");
  assert.equal(rankedOnly.stats.heals.displayValue, "—");
  assert.equal(rankedOnly.stats.kills.value, 334);
});

test("a season with no activity anywhere renders zeros even when a ranked object exists", () => {
  const tierOnlyRanked = {
    squad: {
      currentTier: { tier: "Master", subTier: "0" },
      currentRankPoint: 4123,
      roundsPlayed: 0,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      dBNOs: 0,
      assists: 0,
      wins: 0,
      top10Ratio: 0,
      headshotKills: 0,
      longestKill: 0,
      playTime: 0,
      revives: 0,
      heals: 0,
      boosts: 0,
      teamKills: 0,
      avgSurvivalTime: 0,
    },
  };
  const withRanked = mapSeason({}, tierOnlyRanked);
  const withoutRanked = mapSeason({}, null);

  assert.equal(withRanked.includesRanked, true);
  assert.ok(withRanked.rankedInfo);
  assert.equal(withRanked.stats.timePlayed.displayValue, "0h");
  assert.equal(withRanked.stats.heals.displayValue, "0");
  assert.equal(withRanked.stats.headshotRate.displayValue, "0%");
  assert.equal(withRanked.stats.longestSurvival.displayValue, "0h 0m");
  assert.deepEqual(withRanked.stats, withoutRanked.stats);
  assert.deepEqual(withRanked.modes, {});
});

test("mapPubgStatsToFrontend combined season stats reflect both normal and ranked play", () => {
  const lifetimeStats = { gameModeStats: normalGameModeStats };
  const seasonData = {
    id: "division.bro.official.pc-2018-30",
    attributes: { gameModeStats: normalGameModeStats },
  };
  const rankedSeasonData = { attributes: { rankedGameModeStats } };

  const { data } = mapPubgStatsToFrontend(
    lifetimeStats,
    "Me",
    "account.me",
    seasonData,
    rankedSeasonData,
    null,
    null,
    "steam",
    null,
    null
  );

  assert.equal(data.season.includesRanked, true);
  assert.equal(data.season.stats.timePlayed.value, 3600);
  assert.equal(data.season.stats.timePlayed.displayValue, "1h");
  assert.equal(data.season.stats.top10s.value, 10); // 5 normal + 5 derived ranked
  assert.equal(data.season.stats.kills.value, 30);
});
