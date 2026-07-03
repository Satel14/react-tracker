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
  assert.equal(data.season.stats.timePlayed.value, 10800); // 3600 normal + 7200 ranked playTime
  assert.equal(data.season.stats.timePlayed.displayValue, "3h");
  assert.equal(data.season.stats.top10s.value, 10); // 5 normal + 5 derived ranked
  assert.equal(data.season.stats.kills.value, 30);
});
