const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapWeaponMastery } = require("./enrichment");

// Shape and values captured from a live weapon_mastery response (steam/Satel14, 2026-07-22).
const REAL_PAYLOAD = {
  data: {
    attributes: {
      weaponSummaries: {
        Item_Weapon_ACE32_C: {
          XPTotal: 12345,
          LevelCurrent: 10,
          TierCurrent: 2,
          StatsTotal: {
            MostDefeatsInAGame: 5,
            Defeats: 58,
            MostDamagePlayerInAGame: 462.72000312805176,
            DamagePlayer: 6284.027501106262,
            MostHeadShotsInAGame: 5,
            HeadShots: 28,
            LongestDefeat: 136.9059600830078,
            LongRangeDefeats: 4,
            Kills: 39,
            MostKillsInAGame: 4,
            Groggies: 50,
            MostGroggiesInAGame: 4,
          },
        },
      },
    },
  },
};

test("maps LongestDefeat (the real PUBG key) into the longestKill field the UI renders", () => {
  const [weapon] = mapWeaponMastery(REAL_PAYLOAD);
  assert.equal(weapon.longestKill, 137);
});

test("maps the remaining StatsTotal keys the weapons tab consumes", () => {
  const [weapon] = mapWeaponMastery(REAL_PAYLOAD);
  assert.equal(weapon.kills, 39);
  assert.equal(weapon.headshots, 28);
  assert.equal(weapon.damage, 6284);
  assert.equal(weapon.defeats, 58);
  assert.equal(weapon.groggies, 50);
  assert.equal(weapon.headshotRate, 71.8);
  assert.equal(weapon.avgDamagePerKill, 161);
});

// StatsTotal froze at patch 18.2; OfficialStatsTotal (normal) and
// CompetitiveStatsTotal (ranked) accumulate separately since. Shape and values
// captured from a live weapon_mastery response (steam/Satel14, 2026-07-22).
const THREE_BLOCK_PAYLOAD = {
  data: {
    attributes: {
      weaponSummaries: {
        "Item_Weapon_SCAR-L_C": {
          XPTotal: 90000,
          LevelCurrent: 25,
          TierCurrent: 3,
          StatsTotal: {
            Kills: 23,
            HeadShots: 14,
            DamagePlayer: 4255.4,
            Defeats: 35,
            Groggies: 30,
            LongestDefeat: 156.30470275878906,
          },
          OfficialStatsTotal: {
            Kills: 149,
            HeadShots: 68,
            DamagePlayer: 16330.3,
            Defeats: 0,
            Groggies: 104,
            LongestKill: 152,
          },
          CompetitiveStatsTotal: {
            Kills: 283,
            HeadShots: 214,
            DamagePlayer: 41997.2,
            Defeats: 0,
            Groggies: 261,
            LongestKill: 118,
          },
        },
      },
    },
  },
};

test("sums career stats across the frozen legacy block and both post-18.2 blocks", () => {
  const [weapon] = mapWeaponMastery(THREE_BLOCK_PAYLOAD);
  assert.equal(weapon.kills, 455);
  assert.equal(weapon.headshots, 296);
  assert.equal(weapon.damage, 62583);
  assert.equal(weapon.defeats, 35);
  assert.equal(weapon.groggies, 395);
  assert.equal(weapon.headshotRate, 65.1);
  assert.equal(weapon.avgDamagePerKill, 138);
});

test("longest distance is the max across legacy LongestDefeat and post-18.2 LongestKill", () => {
  const [weapon] = mapWeaponMastery(THREE_BLOCK_PAYLOAD);
  assert.equal(weapon.longestKill, 156);
});

test("handles a post-18.2-only weapon with an empty legacy block", () => {
  const payload = {
    data: {
      attributes: {
        weaponSummaries: {
          Item_Weapon_MG3_C: {
            XPTotal: 500,
            LevelCurrent: 2,
            TierCurrent: 1,
            StatsTotal: {},
            OfficialStatsTotal: { Kills: 7, HeadShots: 2, DamagePlayer: 900.5, Groggies: 8, LongestKill: 210 },
            CompetitiveStatsTotal: { Kills: 3, HeadShots: 1, DamagePlayer: 400.4, Groggies: 2, LongestKill: 95 },
          },
        },
      },
    },
  };
  const [weapon] = mapWeaponMastery(payload);
  assert.equal(weapon.kills, 10);
  assert.equal(weapon.longestKill, 210);
  assert.equal(weapon.damage, 1301);
});
