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
