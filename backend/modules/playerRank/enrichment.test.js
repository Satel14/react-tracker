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

test("mapWeaponMastery still resolves an exact-case Item_Weapon_* label after the telemetry case-join fix", () => {
  const [weapon] = mapWeaponMastery({
    data: { attributes: { weaponSummaries: { Item_Weapon_FAMASG2_C: { XPTotal: 1, LevelCurrent: 1, TierCurrent: 1, StatsTotal: { Kills: 1 } } } } },
  });
  assert.equal(weapon.name, "Famas");
  assert.equal(weapon.category, "ar");
});

test("maps the remaining StatsTotal keys the weapons tab consumes", () => {
  const [weapon] = mapWeaponMastery(REAL_PAYLOAD);
  assert.equal(weapon.kills, 39);
  assert.equal(weapon.headshots, 28);
  assert.equal(weapon.damage, 6284);
  assert.equal(weapon.defeats, 58);
  assert.equal(weapon.groggies, 50);
  assert.equal(weapon.avgDamagePerKill, 161);
});

// HeadShots counts headshot hits, not kills, so no percentage is derivable.
test("no headshot rate is derived from the hit-based HeadShots counter", () => {
  const [weapon] = mapWeaponMastery({
    data: {
      attributes: {
        weaponSummaries: {
          Item_Weapon_Dragunov_C: {
            XPTotal: 40000,
            LevelCurrent: 20,
            TierCurrent: 3,
            StatsTotal: {
              Kills: 92,
              HeadShots: 154,
              DamagePlayer: 30084,
              Groggies: 133,
              LongestDefeat: 415.5,
            },
          },
        },
      },
    },
  });
  assert.equal(weapon.kills, 92);
  assert.equal(weapon.headshots, 154);
  assert.equal(weapon.damage, 30084);
  assert.equal(weapon.groggies, 133);
  assert.equal(weapon.longestKill, 416);
  assert.equal("headshotRate" in weapon, false);
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

// The RP attribution rule reads both of these off the payload: `complete` tells
// it whether an unseen older match could exist, `fetchedAt` how fresh the list
// is relative to PUBG's ingestion lag.
const profileWithMatches = (count) => ({
  data: {
    id: ENRICH_ACCOUNT,
    attributes: { name: "EnrichNeo", banType: "Innocent", clanId: null },
    relationships: {
      matches: { data: Array.from({ length: count }, (_unused, i) => ({ type: "match", id: `m${i}` })) },
    },
  },
});

const matchPayload = (id) => ({
  data: {
    id,
    attributes: { createdAt: "2026-09-01T15:00:00Z", duration: 1500, mapName: "Baltic_Main", gameMode: "squad-fpp", matchType: "competitive", shardId: "steam" },
    relationships: { rosters: { data: [] } },
  },
  included: [],
});

test("a match list shorter than one page is reported as the whole history", async () => {
  const { doRequest } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(3) }],
    ["/matches/", (url) => ({ ok: true, json: async () => matchPayload(url.split("/matches/")[1]) })],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());
  const before = Date.now();

  const extras = await service.getMatchExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo", playerRecord: null,
  });

  assert.equal(extras.matches.complete, true);
  assert.ok(extras.matches.fetchedAt >= before, "the fetch time is recorded");
  assert.ok(extras.matches.fetchedAt <= Date.now());
});

test("a full page of matches may be hiding older ones, so it is not complete", async () => {
  const { doRequest, calls } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(20) }],
    ["/matches/", (url) => ({ ok: true, json: async () => matchPayload(url.split("/matches/")[1]) })],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMatchExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo", playerRecord: null,
  });

  assert.equal(extras.matches.complete, false);
  assert.equal(calls.filter((url) => url.includes("/matches/")).length, 8, "knowing the list is short buys no extra fetches");
});

// --- match regions ---------------------------------------------------------

const telemetryHead = (region) =>
  `[{"_T":"LogMatchDefinition","MatchId":"match.bro.official.pc-2018-42.steam.squad-fpp.${region}.2026.09.08.21.abc"}`;

// A match record with the telemetry asset attached, the way PUBG answers.
const matchWithAsset = (id) => ({
  data: {
    id,
    attributes: { createdAt: "2026-09-08T21:00:00Z", duration: 1500, mapName: "Baltic_Main", gameMode: "squad-fpp", matchType: "competitive", shardId: "steam" },
    relationships: { rosters: { data: [] }, assets: { data: [{ id: `asset-${id}` }] } },
  },
  included: [
    { type: "participant", id: "p0", attributes: { stats: { playerId: ENRICH_ACCOUNT, name: "EnrichNeo", kills: 1, damageDealt: 100, winPlace: 4 } } },
    { type: "roster", id: "r1", attributes: { won: "false", stats: { rank: 4, teamId: 3 } }, relationships: { participants: { data: [{ id: "p0" }] } } },
    { type: "asset", id: `asset-${id}`, attributes: { URL: `https://telemetry-cdn.pubg.com/${id}-telemetry.json` } },
  ],
});

const realFetch = global.fetch;

test("match regions come off the telemetry head, one ranged read per match", async () => {
  const { doRequest, calls } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(3) }],
    ["/matches/", (url) => ({ ok: true, json: async () => matchWithAsset(url.split("/matches/")[1]) })],
  ]);

  const ranged = [];
  global.fetch = async (url, options) => {
    ranged.push({ url, range: options?.headers?.Range });
    return { ok: true, status: 206, text: async () => telemetryHead(url.includes("m1") ? "as" : "eu") };
  };

  try {
    const service = createService(async (url) => (await doRequest(url)).json());
    const extras = await service.getMasteryExtras({
      shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
    });

    assert.deepEqual(extras.matchRegions, { m0: "eu", m1: "as", m2: "eu" });
    assert.equal(ranged.length, 3);
    ranged.forEach((call) => assert.match(call.range, /^bytes=0-\d+$/));
    // The CDN is not the rate-limited API: none of this went through doRequest.
    assert.ok(calls.every((url) => !url.includes("telemetry-cdn")));
  } finally {
    global.fetch = realFetch;
  }
});

test("a match whose telemetry cannot be read simply has no region", async () => {
  const { doRequest } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(2) }],
    ["/matches/", (url) => ({ ok: true, json: async () => matchWithAsset(url.split("/matches/")[1]) })],
  ]);

  global.fetch = async (url) => (url.includes("m0")
    ? { ok: true, status: 206, text: async () => telemetryHead("eu") }
    : { ok: false, status: 404, text: async () => "" });

  try {
    const service = createService(async (url) => (await doRequest(url)).json());
    const extras = await service.getMasteryExtras({
      shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
    });

    // Cosmetic field: one unreadable file must not take the rest of extras with
    // it, nor mark the payload partial.
    assert.deepEqual(extras.matchRegions, { m0: "eu" });
    assert.equal(extras.status, "ok");
  } finally {
    global.fetch = realFetch;
  }
});

test("a region already known is not fetched twice", async () => {
  const routes = [
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(1) }],
    ["/matches/", (url) => ({ ok: true, json: async () => matchWithAsset(url.split("/matches/")[1]) })],
  ];
  const regionCache = new Map();
  let reads = 0;
  global.fetch = async () => {
    reads += 1;
    return { ok: true, status: 206, text: async () => telemetryHead("eu") };
  };

  try {
    const build = () => createPlayerEnrichmentService({
      doRequest: async (url) => (await createFakeDoRequest(routes).doRequest(url)).json(),
      clanCache: new Map(),
      masteryCache: new Map(),
      matchSummaryCache: new Map(),
      profileCache: new Map(),
      matchRegionCache: regionCache,
      cacheDuration: 10 * 60 * 1000,
    });

    const first = await build().getMasteryExtras({ shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo" });
    // A fresh service, so only the shared region cache can save the read: a
    // match's region never changes once played.
    const second = await build().getMasteryExtras({ shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo" });

    assert.deepEqual(first.matchRegions, { m0: "eu" });
    assert.deepEqual(second.matchRegions, { m0: "eu" });
    assert.equal(reads, 1);
  } finally {
    global.fetch = realFetch;
  }
});

test("the region cache keeps a ceiling, oldest out first", async () => {
  // Regions never expire -- nothing about a played match changes -- so the only
  // thing standing between this and unbounded growth is the cap.
  const regionCache = new Map(Array.from({ length: 500 }, (_unused, i) => [`old-${i}`, "eu"]));
  const { doRequest } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(1) }],
    ["/matches/", (url) => ({ ok: true, json: async () => matchWithAsset(url.split("/matches/")[1]) })],
  ]);
  global.fetch = async () => ({ ok: true, status: 206, text: async () => telemetryHead("as") });

  try {
    const service = createPlayerEnrichmentService({
      doRequest: async (url) => (await doRequest(url)).json(),
      clanCache: new Map(),
      masteryCache: new Map(),
      matchSummaryCache: new Map(),
      profileCache: new Map(),
      matchRegionCache: regionCache,
      cacheDuration: 10 * 60 * 1000,
    });
    await service.getMasteryExtras({ shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo" });

    assert.equal(regionCache.size, 500);
    assert.equal(regionCache.get("m0"), "as", "the new region is the one that stayed");
    assert.equal(regionCache.has("old-0"), false, "the oldest entry is the one that went");
  } finally {
    global.fetch = realFetch;
  }
});

// --- survival mastery ------------------------------------------------------

// Shape captured live 2026-09-09 (steam/Satel14, 6 605 matches): level, tier, xp
// and lastMatchId carry real values while every metric under `stats` is a zero
// -- PUBG stopped populating them. The one exception is timeSurvived's
// lastMatchValue, which is why the zeros are not simply a fresh account.
const SURVIVAL_PAYLOAD = {
  data: {
    attributes: {
      level: 449,
      tier: 4,
      xp: 3497680,
      totalMatchesPlayed: 6605,
      lastMatchId: "match-abc",
      stats: {
        damageDealt: { total: 0, average: 0, careerBest: 0, lastMatchValue: 0 },
        timeSurvived: { total: 0, average: 0, careerBest: 0, lastMatchValue: 891 },
        top10: { total: 0 },
      },
    },
  },
};

test("survival mastery reads the match id from the field PUBG actually sends", async () => {
  // survival_mastery calls it lastMatchId; latestMatchId is weapon_mastery's
  // name for it, and reading that one made this null on every profile.
  const { doRequest } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => SURVIVAL_PAYLOAD }],
    [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => PROFILE_NO_CLAN }],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMasteryExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
  });

  assert.equal(extras.survivalMastery.lastMatchId, "match-abc");
  assert.deepEqual(
    [extras.survivalMastery.level, extras.survivalMastery.tier, extras.survivalMastery.totalMatchesPlayed],
    [449, 4, 6605]
  );
  // The highlights list is gone: every metric it read is a zero for every
  // account, so it shipped an always-empty array in every payload.
  assert.ok(!("highlights" in extras.survivalMastery));
  assert.ok(!("latestMatchId" in extras.survivalMastery));
});

// --- party overlap ---------------------------------------------------------

const mateId = (n) => `account.${String(n).padStart(2, "0").repeat(16)}`;

// A match whose roster holds the focal player plus `mates`.
const matchWithMates = (id, mates) => ({
  data: {
    id,
    attributes: { createdAt: "2026-09-08T21:00:00Z", duration: 1500, mapName: "Baltic_Main", gameMode: "squad-fpp", matchType: "competitive", shardId: "steam" },
    relationships: { rosters: { data: [] } },
  },
  included: [
    { type: "participant", id: "p0", attributes: { stats: { playerId: ENRICH_ACCOUNT, name: "EnrichNeo", kills: 2, damageDealt: 300, winPlace: 3 } } },
    ...mates.map((account, i) => ({
      type: "participant",
      id: `p${i + 1}`,
      attributes: { stats: { playerId: account, name: `Mate${i + 1}`, kills: 1, damageDealt: 100, winPlace: 3 } },
    })),
    {
      type: "roster",
      id: "r1",
      attributes: { won: "false", stats: { rank: 3, teamId: 7 } },
      relationships: { participants: { data: [{ id: "p0" }, ...mates.map((_unused, i) => ({ id: `p${i + 1}` }))] } },
    },
  ],
});

// Every mate's own match list: `shared` of the focal player's ids, then filler.
const batchRecord = (account, name, shared, theirs) => ({
  id: account,
  type: "player",
  attributes: { name },
  relationships: {
    matches: {
      data: [
        ...Array.from({ length: shared }, (_unused, i) => ({ id: `m${i}` })),
        ...Array.from({ length: theirs - shared }, (_unused, i) => ({ id: `${name}-own-${i}` })),
      ],
    },
  },
});

const partyRoutes = (matchMates, records) => [
  [`/players/${ENRICH_ACCOUNT}/survival_mastery`, { ok: true, json: async () => ({ data: { attributes: {} } }) }],
  [`/players/${ENRICH_ACCOUNT}/weapon_mastery`, { ok: true, json: async () => ({ data: { attributes: { weaponSummaries: {} } } }) }],
  ["filter[playerIds]", (url) => {
    const asked = new Set(decodeURIComponent(url.split("filter[playerIds]=")[1]).split(","));
    return { ok: true, json: async () => ({ data: records.filter((record) => asked.has(record.id)) }) };
  }],
  [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(50) }],
  ["/matches/", (url) => {
    const id = url.split("/matches/")[1];
    return { ok: true, json: async () => matchWithMates(id, matchMates[id] || []) };
  }],
];

test("getMasteryExtras measures party overlap from each mate's own history", async () => {
  // The regular shares 40 of their 50 matches with this player; the fill shares
  // one of 100. Only the first is a party mate.
  const regular = mateId(1);
  const fill = mateId(2);
  const { doRequest, calls } = createFakeDoRequest(
    partyRoutes(
      { m0: [regular, fill], m1: [regular] },
      [batchRecord(regular, "Regular", 40, 50), batchRecord(fill, "Fill", 1, 100)]
    )
  );
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMasteryExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
  });

  assert.equal(extras.status, "ok");
  assert.deepEqual(
    extras.party.map((row) => [row.name, row.sharedMatches, row.theirMatches, row.sharePct, row.isParty]),
    [["Regular", 40, 50, 80, true], ["Fill", 1, 100, 1, false]]
  );
  // One batch request covers every candidate; the focal player is not in it,
  // since their own list already came from the profile.
  const batches = calls.filter((url) => url.includes("filter[playerIds]"));
  assert.equal(batches.length, 1);
  assert.ok(!batches[0].includes(ENRICH_ACCOUNT));
});

test("party overlap asks PUBG about ten accounts per request and stops at two", async () => {
  // Eight squad matches can surface more mates than two batches hold, so the
  // most-seen candidates go first and the tail is dropped rather than fetched.
  const mates = Array.from({ length: 25 }, (_unused, i) => mateId(i + 1));
  const matchMates = {};
  for (let i = 0; i < 8; i += 1) matchMates[`m${i}`] = mates.slice(i * 3, i * 3 + 3);
  matchMates.m0 = [mates[0], mates[1], mates[2]];

  const { doRequest, calls } = createFakeDoRequest(
    partyRoutes(matchMates, mates.map((account, i) => batchRecord(account, `Mate${i + 1}`, 2, 40)))
  );
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMasteryExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
  });

  const batches = calls.filter((url) => url.includes("filter[playerIds]"));
  assert.equal(batches.length, 2);
  batches.forEach((url) => {
    const ids = decodeURIComponent(url.split("filter[playerIds]=")[1]).split(",");
    assert.ok(ids.length <= 10, `a batch asked for ${ids.length} accounts`);
  });
  assert.equal(extras.party.length, 20);
});

test("a bot in the roster is never a party candidate", async () => {
  const { doRequest, calls } = createFakeDoRequest(
    partyRoutes({ m0: ["ai.9001", "ai.9002"] }, [])
  );
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMasteryExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
  });

  assert.deepEqual(extras.party, []);
  assert.ok(calls.every((url) => !url.includes("filter[playerIds]")), "no accounts to ask about, no request");
});

test("a failed party batch leaves clan and mastery intact and says what broke", async () => {
  const regular = mateId(1);
  const routes = partyRoutes({ m0: [regular] }, []);
  const service = createService(
    async (url) => {
      if (url.includes("filter[playerIds]")) throw new Error("Rate Limit Reached");
      const { doRequest } = createFakeDoRequest(routes);
      return (await doRequest(url)).json();
    }
  );

  const extras = await service.getMasteryExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo",
  });

  assert.equal(extras.status, "partial");
  assert.match(extras.error, /party: Rate Limit Reached/);
  // party is null, not [], so the page can tell "unknown" from "no party".
  assert.equal(extras.party, null);
  assert.ok("weaponMastery" in extras);
});

test("a player with no matches at all has a complete, empty history", async () => {
  const { doRequest } = createFakeDoRequest([
    [`/players/${ENRICH_ACCOUNT}`, { ok: true, json: async () => profileWithMatches(0) }],
  ]);
  const service = createService(async (url) => (await doRequest(url)).json());

  const extras = await service.getMatchExtras({
    shard: "steam", accountId: ENRICH_ACCOUNT, playerName: "EnrichNeo", playerRecord: null,
  });

  assert.equal(extras.matches.complete, true);
  assert.ok(Number.isFinite(extras.matches.fetchedAt));
});
