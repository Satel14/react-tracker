const { getMapMeta } = require("./mapMeta");
const { loadMatchBundle } = require("./matchLoader");
const { isFocalActor, readXY, eventTime } = require("./telemetryUtils");
const { telemetryWeaponName } = require("./weaponMeta");

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

function buildNameToTeam(telemetry) {
  const map = new Map();
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogMatchStart") continue;
    for (const c of ev.characters || []) {
      const ch = c?.character || c;
      if (ch?.name != null && ch?.teamId != null) map.set(ch.name, ch.teamId);
    }
  }
  return map;
}

function parseKillFeed(telemetry, { matchStartMs = 0, accountId = null, playerName = null } = {}) {
  const { accountKey, lowerName } = focalKeys({ accountId, playerName });
  const nameToTeam = buildNameToTeam(telemetry);
  const kills = [];
  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    if (ev?._T !== "LogPlayerKillV2") continue;
    const t = eventTime(ev, matchStartMs);
    const victim = ev.victim || null;
    const killer = ev.killer ?? ev.finisher ?? ev.dBNOMaker ?? null;
    const dmgInfo = ev.killerDamageInfo || ev.finishDamageInfo || {};
    const weaponKey = dmgInfo.damageCauserName || ev.damageCauserName || null;
    const rawDistance = dmgInfo.distance;
    const distance = Number.isFinite(Number(rawDistance)) ? Math.round(Number(rawDistance) / 100) : null;
    const killerName = killer?.name || null;
    const victimName = victim?.name || null;
    const kxy = readXY(killer?.location);
    const vxy = readXY(victim?.location);
    kills.push({
      t,
      killerName,
      killerTeamId: killerName != null ? (nameToTeam.get(killerName) ?? null) : null,
      victimName,
      victimTeamId: victimName != null ? (nameToTeam.get(victimName) ?? null) : null,
      weapon: telemetryWeaponName(weaponKey),
      weaponKey,
      distance,
      damageReason: dmgInfo.damageReason || null,
      kx: kxy ? kxy.x : null,
      ky: kxy ? kxy.y : null,
      vx: vxy ? vxy.x : null,
      vy: vxy ? vxy.y : null,
      isFocalKill: isFocalActor(killer, accountKey, lowerName),
      isFocalDeath: isFocalActor(victim, accountKey, lowerName),
    });
  }
  kills.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  return kills;
}

async function getMatchAnalysis({ shard, matchId, accountId = null, playerName = null }) {
  if (!matchId) throw new Error("matchId is required");
  const { matchShard, matchAttributes, matchPayload, telemetry } = await loadMatchBundle({ shard, matchId });
  const focalTag = accountId || playerName || "-";
  const cacheKey = `${matchShard}:${matchId}:${focalTag}`;
  if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey);

  const rawMapName = matchAttributes.mapName || "";
  const meta = getMapMeta(rawMapName);
  const matchStartMs = Date.parse(matchAttributes.createdAt || "");
  const scoreboard = parseScoreboard(matchPayload, { accountId, playerName });
  const killFeed = parseKillFeed(telemetry, { matchStartMs, accountId, playerName });

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
    killFeed,
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

module.exports = { getMatchAnalysis, parseScoreboard, parseKillFeed };
