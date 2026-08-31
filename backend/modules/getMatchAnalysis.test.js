const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseScoreboard } = require("./getMatchAnalysis");

const matchPayload = {
  data: { attributes: { mapName: "Baltic_Main", duration: 100, createdAt: "2026-01-01T00:00:00.000Z" } },
  included: [
    { type: "participant", id: "p1", attributes: { stats: { playerId: "account.me", name: "Me", kills: 3, damageDealt: 412.7, assists: 1, DBNOs: 2, headshotKills: 1, timeSurvived: 1200, winPlace: 1, deathType: "alive" } } },
    { type: "participant", id: "p2", attributes: { stats: { playerId: "account.mate", name: "Mate", kills: 1, damageDealt: 90, assists: 0, DBNOs: 0, headshotKills: 0, timeSurvived: 1200, winPlace: 1, deathType: "alive" } } },
    { type: "participant", id: "p3", attributes: { stats: { playerId: "account.foe", name: "Foe", kills: 5, damageDealt: 800, assists: 2, DBNOs: 3, headshotKills: 2, timeSurvived: 900, winPlace: 2, deathType: "byplayer" } } },
    { type: "roster", id: "r1", attributes: { won: "true", stats: { rank: 1, teamId: 10 } }, relationships: { participants: { data: [{ id: "p1" }, { id: "p2" }] } } },
    { type: "roster", id: "r2", attributes: { won: "false", stats: { rank: 2, teamId: 20 } }, relationships: { participants: { data: [{ id: "p3" }] } } },
  ],
};

test("parseScoreboard sorts teams by placement", () => {
  const sb = parseScoreboard(matchPayload, { accountId: "account.me" });
  assert.deepEqual(sb.teams.map((t) => t.rank), [1, 2]);
  assert.equal(sb.totalTeams, 2);
  assert.equal(sb.totalPlayers, 3);
});

test("parseScoreboard maps player stats and rounds damage", () => {
  const sb = parseScoreboard(matchPayload, { accountId: "account.me" });
  const me = sb.teams[0].players.find((p) => p.accountId === "account.me");
  assert.equal(me.kills, 3);
  assert.equal(me.damageDealt, 413); // rounded from 412.7
  assert.equal(me.DBNOs, 2);
});

test("parseScoreboard flags focal player and team; sorts players within a team by kills", () => {
  const sb = parseScoreboard(matchPayload, { accountId: "account.me" });
  assert.equal(sb.focalAccountId, "account.me");
  assert.equal(sb.focalTeamId, 10);
  assert.equal(sb.teams[0].isFocalTeam, true);
  assert.equal(sb.teams[0].players[0].name, "Me"); // 3 kills before mate's 1
  assert.equal(sb.teams[0].players.find((p) => p.isFocal).name, "Me");
});

test("parseScoreboard resolves focal by name when accountId is absent", () => {
  const sb = parseScoreboard(matchPayload, { playerName: "foe" });
  assert.equal(sb.focalTeamId, 20);
});

const { parseKillFeed } = require("./getMatchAnalysis");

const killTelemetry = [
  { _T: "LogMatchStart", characters: [
    { character: { accountId: "account.me", name: "Me", teamId: 1 } },
    { character: { accountId: "account.foe", name: "Foe", teamId: 2 } },
  ] },
  { _T: "LogPlayerKillV2", elapsedTime: 30,
    killer: { accountId: "account.me", name: "Me", location: { x: 100000, y: 100000, z: 0 } },
    victim: { accountId: "account.foe", name: "Foe", location: { x: 130000, y: 140000, z: 0 } },
    killerDamageInfo: { damageCauserName: "WeapHK416_C", distance: 5000, damageReason: "HeadShot" } },
  // killer field null, only finisher present — must still resolve a killer
  { _T: "LogPlayerKillV2", elapsedTime: 60,
    killer: null, finisher: { accountId: "account.foe", name: "Foe", location: { x: 200000, y: 200000, z: 0 } },
    victim: { accountId: "account.me", name: "Me", location: { x: 210000, y: 205000, z: 0 } },
    finishDamageInfo: { damageCauserName: "WeapKar98k_C", distance: 12000, damageReason: "TorsoShot" } },
];

test("parseKillFeed lists all lobby kills sorted by time with weapon + metre distance", () => {
  const feed = parseKillFeed(killTelemetry, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(feed.length, 2);
  assert.deepEqual(feed.map((k) => k.t), [30, 60]);
  assert.equal(feed[0].weapon, "M416");
  assert.equal(feed[0].distance, 50); // 5000 cm -> 50 m
  assert.equal(feed[0].isFocalKill, true);
});

test("parseKillFeed resolves killer from finisher when killer is absent", () => {
  const feed = parseKillFeed(killTelemetry, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(feed[1].killerName, "Foe");
  assert.equal(feed[1].isFocalDeath, true);
  assert.equal(feed[1].weapon, "Kar98k");
});

test("parseKillFeed attaches team ids from LogMatchStart", () => {
  const feed = parseKillFeed(killTelemetry, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(feed[0].killerTeamId, 1);
  assert.equal(feed[0].victimTeamId, 2);
});

const { parseDamage } = require("./getMatchAnalysis");

const dmgTelemetry = [
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 34, damageReason: "HeadShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 20, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
  // taken by focal from an enemy
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "account.foe", name: "Foe" }, victim: { accountId: "account.me", name: "Me" }, damage: 18, damageReason: "LegShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapKar98k_C" },
  // blue-zone damage taken — must be excluded from body-part totals
  { _T: "LogPlayerTakeDamage", attacker: { accountId: "" }, victim: { accountId: "account.me", name: "Me" }, damage: 12, damageReason: "NonSpecific", damageTypeCategory: "Damage_BlueZone", damageCauserName: "Buff_DamageBluezone_C" },
];

test("parseDamage aggregates dealt damage by body region and rounds", () => {
  const d = parseDamage(dmgTelemetry, { accountId: "account.me" });
  assert.equal(d.dealt.HeadShot, 34);
  assert.equal(d.dealt.TorsoShot, 20);
  assert.equal(d.dealt.total, 54);
  assert.equal(d.dealt.hitCount, 2);
});

test("parseDamage aggregates taken damage and excludes blue-zone from body totals", () => {
  const d = parseDamage(dmgTelemetry, { accountId: "account.me" });
  assert.equal(d.taken.LegShot, 18);
  assert.equal(d.taken.total, 18); // blue-zone 12 excluded
});

test("parseDamage builds a weapon breakdown and headshot-damage percent", () => {
  const d = parseDamage(dmgTelemetry, { accountId: "account.me" });
  assert.equal(d.dealtByWeapon[0].weapon, "M416");
  assert.equal(d.dealtByWeapon[0].damage, 54);
  assert.equal(d.headshotDamagePct, 63); // round(34/54*100)
});

test("parseDamage groups one weapon's differently-named causers into a single row", () => {
  const panzerTelemetry = [
    { _T: "LogPlayerTakeDamage", elapsedTime: 10, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 60, damageReason: "TorsoShot", damageTypeCategory: "Damage_Explosion_RedZone_Explode", damageCauserName: "WeapPanzerFaust100M1_C" },
    { _T: "LogPlayerTakeDamage", elapsedTime: 11, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 40, damageReason: "TorsoShot", damageTypeCategory: "Damage_Explosion_RedZone_Explode", damageCauserName: "PanzerFaust100M_Projectile_C" },
  ];
  const d = parseDamage(panzerTelemetry, { accountId: "account.me" });
  const rows = d.dealtByWeapon.filter((w) => w.weapon === "PanzerFaust");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].damage, 100);
  assert.equal(rows[0].hits, 2);
});

const { parseTimeline } = require("./getMatchAnalysis");

const timelineTelemetry = [
  { _T: "LogPlayerAttack", elapsedTime: 10, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_HK416_C" }, fireWeaponStackCount: 1 },
  { _T: "LogPlayerAttack", elapsedTime: 12, attacker: { accountId: "account.me", name: "Me" }, weapon: { itemId: "Item_Weapon_HK416_C" }, fireWeaponStackCount: 2 },
  { _T: "LogPlayerTakeDamage", elapsedTime: 12, attacker: { accountId: "account.me", name: "Me" }, victim: { accountId: "account.foe", name: "Foe" }, damage: 30, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
];

test("parseTimeline computes per-weapon accuracy from shots and hits", () => {
  const tl = parseTimeline(timelineTelemetry, { matchStartMs: 0, accountId: "account.me" });
  const hk = tl.accuracy.find((a) => a.weapon === "M416");
  assert.equal(hk.shots, 2);
  assert.equal(hk.hits, 1);
  assert.equal(hk.pct, 50);
});

test("parseTimeline records dealt combat events for the focal player", () => {
  const tl = parseTimeline(timelineTelemetry, { matchStartMs: 0, accountId: "account.me" });
  const dealt = tl.events.filter((e) => e.kind === "dealt");
  assert.equal(dealt.length, 1);
  assert.equal(dealt[0].opponent, "Foe");
  assert.equal(dealt[0].amount, 30);
});

const thirdPartyTelemetry = [
  { _T: "LogMatchStart", characters: [
    { character: { accountId: "account.me", name: "Me", teamId: 1 } },
    { character: { accountId: "account.a1", name: "A1", teamId: 2 } },
    { character: { accountId: "account.a2", name: "A2", teamId: 2 } },
    { character: { accountId: "account.b1", name: "B1", teamId: 3 } },
  ] },
  // two hits from the same enemy squad (team 2) within the same 15s bucket
  { _T: "LogPlayerTakeDamage", elapsedTime: 1, attacker: { accountId: "account.a1", name: "A1" }, victim: { accountId: "account.me", name: "Me" }, damage: 10, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
  { _T: "LogPlayerTakeDamage", elapsedTime: 2, attacker: { accountId: "account.a2", name: "A2" }, victim: { accountId: "account.me", name: "Me" }, damage: 10, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapHK416_C" },
];

test("parseTimeline does not flag a third party when both attackers are on the same team", () => {
  const tl = parseTimeline(thirdPartyTelemetry, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(tl.thirdParties.length, 0);
});

test("parseTimeline flags a third party when a second team hits the focal player in the same window", () => {
  const withThirdTeam = [
    ...thirdPartyTelemetry,
    { _T: "LogPlayerTakeDamage", elapsedTime: 3, attacker: { accountId: "account.b1", name: "B1" }, victim: { accountId: "account.me", name: "Me" }, damage: 10, damageReason: "TorsoShot", damageTypeCategory: "Damage_Gun", damageCauserName: "WeapKar98k_C" },
  ];
  const tl = parseTimeline(withThirdTeam, { matchStartMs: 0, accountId: "account.me" });
  assert.equal(tl.thirdParties.length, 1);
  assert.equal(tl.thirdParties[0].teamCount, 2);
});

// A kill feed row names two players, and a name alone cannot be linked to a
// profile: a bot's name looks exactly like a person's, and 92 of the 100
// entrants in a real match are bots. The account id is what tells them apart.
test("a kill feed row carries the account ids behind both names", () => {
  const telemetry = [
    { _T: "LogMatchStart", characters: [], common: {}, _D: "2026-01-01T00:00:00.000Z" },
    { _T: "LogPlayerKillV2", _D: "2026-01-01T00:01:00.000Z",
      killer: { name: "Me", accountId: "account.me", location: { x: 100000, y: 100000, z: 0 } },
      victim: { name: "Bot_Frank", accountId: "ai.1031", location: { x: 200000, y: 200000, z: 0 } },
      killerDamageInfo: { damageCauserName: "WeapAUG_C", distance: 5000 } },
  ];
  const [row] = parseKillFeed(telemetry, {});
  assert.equal(row.killerAccountId, "account.me");
  assert.equal(row.victimAccountId, "ai.1031");
});

test("a kill feed row reads through a blank damage block, like the replay does", () => {
  // Same defect the replay payload had: "None" and an empty causer name are
  // non-empty strings that beat the block naming the gun that did it.
  const telemetry = [
    { _T: "LogMatchStart", characters: [], common: {}, _D: "2026-01-01T00:00:00.000Z" },
    { _T: "LogPlayerKillV2", _D: "2026-01-01T00:01:00.000Z",
      killer: { name: "Me", accountId: "account.me", location: { x: 100000, y: 100000, z: 0 } },
      victim: { name: "Foe", accountId: "account.foe", location: { x: 200000, y: 200000, z: 0 } },
      killerDamageInfo: { damageCauserName: "None", distance: -1 },
      dBNODamageInfo: { damageCauserName: "WeapAUG_C", distance: 5000 } },
  ];
  const [row] = parseKillFeed(telemetry, {});
  assert.equal(row.weapon, "AUG");
  assert.equal(row.distance, 50);
});
