const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapPubgStatsToFrontend,
  normalizeRankedModeStats,
  aggregateModeStats,
  combineAggregatedStats,
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

// Normal season stats use PUBG's gameModeStats schema (timeSurvived, top10s).
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

// Ranked stats use PUBG's rankedGameModeStats schema: playTime (seconds) instead
// of timeSurvived, top10Ratio instead of top10s, plus avgSurvivalTime. It omits
// timeSurvived / top10s / roadKills / vehicleDestroys / suicides entirely.
// Shape-only fixture: live ranked payloads return 0 for playTime, headshotKills,
// revives, heals, boosts, teamKills and longestKill (see liveRankedGameModeStats).
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

test("normalizeRankedModeStats maps playTime->timeSurvived and derives top10s from top10Ratio", () => {
  const normalized = normalizeRankedModeStats(rankedGameModeStats);
  const squad = normalized["squad-fpp"];
  assert.equal(squad.timeSurvived, 7200); // from playTime
  assert.equal(squad.top10s, 5); // round(0.5 * 10 roundsPlayed)
  assert.equal(squad.kills, 20);
  assert.equal(squad.wins, 3);
  assert.equal(squad.roundsPlayed, 10);
});

// Raw combine contract: two sources that both report every field simply add up.
test("combineAggregatedStats sums time and top10s across normal + ranked sources", () => {
  const normalAgg = aggregateModeStats(normalGameModeStats);
  const rankedAgg = aggregateModeStats(normalizeRankedModeStats(rankedGameModeStats));
  const combined = combineAggregatedStats(normalAgg, rankedAgg);
  assert.equal(combined.totalTime, 10800); // 3600 + 7200
  assert.equal(combined.totalTop10s, 10); // 5 + 5
  assert.equal(combined.totalKills, 30); // 10 + 20
  assert.equal(combined.totalMatches, 18); // 8 + 10
  assert.equal(combined.totalWins, 5); // 2 + 3
});

// Live capture (steam/CHESTER93 ranked squad + steam/Satel14, 2026-07-28):
// rankedGameModeStats only populates kills, deaths, damageDealt, dBNOs, assists,
// wins, roundsPlayed and top10Ratio; everything below it comes back as literal 0.
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

// The normal-mode slice of the same season: the only source that reports
// headshots, play time, longest kill and consumables.
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
  // 6 headshots / 8 normal kills, NOT 6 / (8 + 334 ranked kills) = 1.8%.
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
  // Ranked never reports play time, so the season total stays normal-only even
  // when a ranked payload claims otherwise.
  assert.equal(data.season.stats.timePlayed.value, 3600);
  assert.equal(data.season.stats.timePlayed.displayValue, "1h");
  assert.equal(data.season.stats.top10s.value, 10); // 5 normal + 5 derived ranked
  assert.equal(data.season.stats.kills.value, 30);
});
