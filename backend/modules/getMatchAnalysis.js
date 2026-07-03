const { getMapMeta } = require("./mapMeta");
const { loadMatchBundle } = require("./matchLoader");
const { isFocalActor } = require("./telemetryUtils");

const analysisCache = new Map();
const ANALYSIS_CACHE_LIMIT = 30;

function focalKeys({ accountId, playerName }) {
  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  const lowerName = typeof playerName === "string" && playerName.trim() ? playerName.trim().toLowerCase() : null;
  return { accountKey, lowerName };
}

function parseScoreboard(matchPayload, { accountId = null, playerName = null } = {}) {
  const included = Array.isArray(matchPayload?.included) ? matchPayload.included : [];
  const { accountKey, lowerName } = focalKeys({ accountId, playerName });

  const statsById = new Map();
  const rosters = [];
  for (const item of included) {
    if (item?.type === "participant") statsById.set(item.id, item.attributes?.stats || {});
    else if (item?.type === "roster") rosters.push(item);
  }

  let focalAccountId = null;
  let focalTeamId = null;
  const teams = [];
  for (const roster of rosters) {
    const rstats = roster.attributes?.stats || {};
    const rank = Number(rstats.rank) || null;
    const teamId = rstats.teamId ?? null;
    const won = String(roster.attributes?.won) === "true";
    const refs = roster.relationships?.participants?.data || [];
    const players = [];
    for (const ref of refs) {
      const s = statsById.get(ref?.id);
      if (!s) continue;
      const pAccountId = typeof s.playerId === "string" ? s.playerId : null;
      const name = typeof s.name === "string" ? s.name : "Unknown";
      const isFocal = isFocalActor({ accountId: pAccountId, name }, accountKey, lowerName);
      if (isFocal) { focalAccountId = pAccountId; focalTeamId = teamId; }
      players.push({
        name,
        accountId: pAccountId,
        kills: Number(s.kills) || 0,
        damageDealt: Math.round(Number(s.damageDealt) || 0),
        assists: Number(s.assists) || 0,
        DBNOs: Number(s.DBNOs ?? s.dBNOs) || 0,
        headshotKills: Number(s.headshotKills) || 0,
        timeSurvived: Number(s.timeSurvived) || 0,
        deathType: typeof s.deathType === "string" ? s.deathType : null,
        isFocal,
      });
    }
    players.sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt);
    teams.push({ rank, teamId, won, players });
  }
  teams.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  for (const team of teams) team.isFocalTeam = focalTeamId != null && team.teamId === focalTeamId;

  const totalPlayers = teams.reduce((n, t) => n + t.players.length, 0);
  return { teams, totalTeams: teams.length, totalPlayers, focalAccountId, focalTeamId };
}

async function getMatchAnalysis({ shard, matchId, accountId = null, playerName = null }) {
  if (!matchId) throw new Error("matchId is required");
  const { matchShard, matchAttributes, matchPayload, telemetry } = await loadMatchBundle({ shard, matchId });
  const focalTag = accountId || playerName || "-";
  const cacheKey = `${matchShard}:${matchId}:${focalTag}`;
  if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey);

  const rawMapName = matchAttributes.mapName || "";
  const meta = getMapMeta(rawMapName);
  const scoreboard = parseScoreboard(matchPayload, { accountId, playerName });

  const result = {
    matchId,
    rawMapName,
    mapName: meta.displayName,
    mapMax: meta.mapMax,
    duration: Number(matchAttributes.duration) || 0,
    createdAt: matchAttributes.createdAt || null,
    focalAccountId: scoreboard.focalAccountId,
    focalTeamId: scoreboard.focalTeamId,
    scoreboard,
    killFeed: [], // Task 5
    damage: null, // Task 7
  };

  analysisCache.set(cacheKey, result);
  while (analysisCache.size > ANALYSIS_CACHE_LIMIT) {
    const oldest = analysisCache.keys().next().value;
    if (!oldest) break;
    analysisCache.delete(oldest);
  }
  return result;
}

module.exports = { getMatchAnalysis, parseScoreboard };
