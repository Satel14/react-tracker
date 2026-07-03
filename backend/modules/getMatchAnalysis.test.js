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
