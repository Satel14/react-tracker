const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPlayerEnrichmentService, mapWeaponMastery } = require("./enrichment");

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

function createFakeDoRequest(routes) {
  const calls = [];
  const doRequest = async (url) => {
    calls.push(url);
    for (const [pattern, responder] of routes) {
      if (url.includes(pattern)) {
        const value = typeof responder === "function" ? responder(url) : responder;
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`unexpected url: ${url}`);
  };
  return { doRequest, calls };
}

function createService(doRequest) {
  return createPlayerEnrichmentService({
    doRequest,
    clanCache: new Map(),
    masteryCache: new Map(),
    matchSummaryCache: new Map(),
    profileCache: new Map(),
    cacheDuration: 10 * 60 * 1000,
  });
}

const ENRICH_ACCOUNT = "account." + "e".repeat(32);
const PROFILE_WITH_CLAN = {
  data: {
    id: ENRICH_ACCOUNT,
    attributes: { name: "EnrichNeo", banType: "Innocent", clanId: "clan.11" },
    relationships: { matches: { data: [] } },
  },
};
const PROFILE_NO_CLAN = {
  data: {
    id: ENRICH_ACCOUNT,
    attributes: { name: "EnrichNeo", banType: "Innocent" },
    relationships: { matches: { data: [] } },
  },
};

test("getMatchExtras returns a deferred profile and fetches no clan/mastery", async () => {
  const { doRequest, calls } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, status: 200, json: async () => PROFILE_WITH_CLAN }],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMatchExtras({
    shard: "steam",
    accountId: ENRICH_ACCOUNT,
    playerName: "EnrichNeo",
    playerRecord: null,
  });

  assert.equal(extras.profile.status, "deferred");
  assert.equal(extras.profile.banType, "Innocent");
  assert.equal(extras.profile.clan, null);
  assert.equal(extras.profile.survivalMastery, null);
  assert.equal(extras.profile.weaponMastery, null);
  assert.equal(extras.matches.summary.total, 0);
  assert.deepEqual(extras.matches.items, []);
  assert.ok(calls.every((u) => !u.includes("clans") && !u.includes("mastery")));
});

test("getMatchExtras skips the profile fetch when a playerRecord is provided", async () => {
  const { doRequest, calls } = createFakeDoRequest([]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMatchExtras({
    shard: "steam",
    accountId: ENRICH_ACCOUNT,
    playerName: "EnrichNeo",
    playerRecord: PROFILE_WITH_CLAN.data,
  });

  assert.equal(extras.profile.status, "deferred");
  assert.equal(calls.length, 0);
});

test("getMasteryExtras returns ok with clan and both masteries", async () => {
  const { doRequest, calls } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => PROFILE_WITH_CLAN }],
    ["/clans/clan.11", { ok: true, json: async () => ({ data: { attributes: { clanName: "Navi", clanTag: "NAVI", clanLevel: 5, clanMemberCount: 10 } } }) }],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMasteryExtras({
    shard: "steam",
    accountId: ENRICH_ACCOUNT,
    playerName: "EnrichNeo",
  });

  assert.equal(extras.status, "ok");
  assert.equal(extras.error, null);
  assert.equal(extras.clan?.tag, "NAVI");
  assert.ok(Array.isArray(extras.weaponMastery));
  assert.ok(!("matches" in extras), "mastery extras must not carry matches");
  assert.ok(calls.some((u) => u.includes("/clans/clan.11")));
});

test("getMasteryExtras degrades to partial when one sub-fetch fails, without throwing", async () => {
  const { doRequest } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, new Error("boom 500")],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => PROFILE_NO_CLAN }],
  ]);
  const service = createService(async (url) => {
    const res = await doRequest(url);
    return res.json();
  });

  const extras = await service.getMasteryExtras({
    shard: "steam",
    accountId: ENRICH_ACCOUNT,
    playerName: "EnrichNeo",
  });

  assert.equal(extras.status, "partial");
  assert.match(extras.error, /weapon mastery: boom 500/);
  assert.notEqual(extras.survivalMastery, null);
  assert.equal(extras.weaponMastery, null);
});

test("getMasteryExtras skips the clan fetch entirely when the player has no clan", async () => {
  const { doRequest, calls } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => PROFILE_NO_CLAN }],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMasteryExtras({
    shard: "steam",
    accountId: ENRICH_ACCOUNT,
    playerName: "EnrichNeo",
  });

  assert.equal(extras.status, "ok");
  assert.equal(extras.clan, null);
  assert.ok(calls.every((u) => !u.includes("/clans/")));
});
