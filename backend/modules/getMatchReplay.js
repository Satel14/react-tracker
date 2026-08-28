const { getMapMeta } = require("./mapMeta");
const { readXY, buildMatchClock } = require("./telemetryUtils");
const { loadMatchBundle } = require("./matchLoader");
const { shardForMatch } = require("./pubgTelemetry");

const replayCache = new Map();
const REPLAY_CACHE_LIMIT = 30;

function lower(s) {
  return typeof s === "string" ? s.trim().toLowerCase() : null;
}

function parseReplayTelemetry(telemetry, { matchAttributes = {}, accountId = null, playerName = null } = {}) {
  const rawMapName = matchAttributes.mapName || "";
  const meta = getMapMeta(rawMapName);
  const duration = Number(matchAttributes.duration) || 0;
  const clock = buildMatchClock(telemetry);

  const roster = new Map();
  const positions = new Map();
  const deathTime = new Map();
  const dropTime = new Map();
  const kills = [];
  const zones = [];

  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
  const lowerName = lower(playerName);

  for (const ev of Array.isArray(telemetry) ? telemetry : []) {
    const type = ev?._T;

    if (type === "LogMatchStart") {
      for (const c of ev.characters || []) {
        const ch = c?.character || c;
        if (ch?.accountId && !roster.has(ch.accountId)) {
          roster.set(ch.accountId, { name: ch.name, teamId: ch.teamId });
        }
      }
      continue;
    }

    if (type === "LogPlayerPosition") {
      const ch = ev.character;
      if (!ch?.accountId) continue;
      if (Number(ev?.common?.isGame) < 0.1) continue;
      const xy = readXY(ch.location);
      if (!xy) continue;
      const t = clock.timeOf(ev);
      if (t === null) continue;
      if (!roster.has(ch.accountId)) roster.set(ch.accountId, { name: ch.name, teamId: ch.teamId });
      if (!positions.has(ch.accountId)) positions.set(ch.accountId, []);
      const arr = positions.get(ch.accountId);
      if (arr.length && arr[arr.length - 1].t === t) continue;
      arr.push({ t, x: xy.x, y: xy.y });
      continue;
    }

    if (type === "LogVehicleLeave") {
      if (ev?.vehicle?.vehicleId !== "DummyTransportAircraft_C") continue;
      const id = ev?.character?.accountId;
      const t = clock.timeOf(ev);
      if (!id || t === null) continue;
      const prev = dropTime.get(id);
      if (prev === undefined || t < prev) dropTime.set(id, t);
      if (!roster.has(id)) roster.set(id, { name: ev.character.name, teamId: ev.character.teamId });
      continue;
    }

    if (type === "LogPlayerKillV2") {
      const victim = ev.victim;
      const killer = ev.killer || ev.finisher || ev.dBNOMaker || null;
      const t = clock.timeOf(ev);
      if (t === null) continue;
      if (victim?.accountId) deathTime.set(victim.accountId, t);
      const vxy = readXY(victim?.location);
      if (!vxy) continue;
      const kxy = readXY(killer?.location);
      kills.push({
        t,
        killer: killer?.name || null,
        victim: victim?.name || null,
        killerAccountId: killer?.accountId || null,
        victimAccountId: victim?.accountId || null,
        killerTeamId: killer?.teamId ?? null,
        victimTeamId: victim?.teamId ?? null,
        kx: kxy ? kxy.x : null,
        ky: kxy ? kxy.y : null,
        vx: vxy.x,
        vy: vxy.y,
      });
      continue;
    }

    if (type === "LogGameStatePeriodic") {
      const gs = ev.gameState || {};
      const t = clock.timeOf(ev);
      const blue = readXY(gs.safetyZonePosition);
      const br = Number(gs.safetyZoneRadius);
      if (t !== null && blue && Number.isFinite(br) && br > 0) {
        const white = readXY(gs.poisonGasWarningPosition);
        const wr = Number(gs.poisonGasWarningRadius);
        zones.push({
          t,
          bx: blue.x,
          by: blue.y,
          br: Math.round(br / 100),
          wx: white ? white.x : blue.x,
          wy: white ? white.y : blue.y,
          wr: Number.isFinite(wr) ? Math.round(wr / 100) : 0,
        });
      }
      continue;
    }
  }

  let focalAccountId = null;
  let focalTeamId = null;
  for (const [id, info] of roster) {
    if ((accountKey && id === accountKey) || (lowerName && lower(info.name) === lowerName)) {
      focalAccountId = id;
      focalTeamId = info.teamId ?? null;
      break;
    }
  }

  const players = [];
  for (const [id, info] of roster) {
    const posArr = positions.get(id) || [];
    posArr.sort((a, b) => a.t - b.t);
    const deduped = [];
    for (const p of posArr) {
      if (deduped.length && deduped[deduped.length - 1].t === p.t) continue;
      deduped.push(p);
    }
    const isFocal =
      (focalAccountId !== null && id === focalAccountId) ||
      (focalTeamId !== null && info.teamId === focalTeamId);
    players.push({
      name: info.name || id,
      accountId: id,
      teamId: info.teamId ?? null,
      isFocal: !!isFocal,
      positions: deduped,
      dropTime: dropTime.has(id) ? dropTime.get(id) : null,
      deathTime: deathTime.has(id) ? deathTime.get(id) : null,
    });
  }
  kills.sort((a, b) => a.t - b.t);
  zones.sort((a, b) => a.t - b.t);

  return {
    rawMapName,
    mapName: meta.displayName,
    mapMax: meta.mapMax,
    duration,
    createdAt: matchAttributes.createdAt || null,
    focalAccountId,
    focalTeamId,
    totalPlayers: roster.size,
    totalTeams: new Set([...roster.values()].map((i) => i.teamId ?? "none")).size,
    players,
    kills,
    zones,
  };
}

async function getMatchReplay({ shard, matchId, accountId, playerName }) {
  if (!matchId) throw new Error("matchId is required");
  const focalTag = accountId || playerName || "-";
  const cacheKey = `${shardForMatch(shard)}:${matchId}:${focalTag}`;
  if (replayCache.has(cacheKey)) return replayCache.get(cacheKey);

  const { matchAttributes, telemetry } = await loadMatchBundle({ shard, matchId });

  const parsed = parseReplayTelemetry(telemetry, { matchAttributes, accountId, playerName });
  const result = { matchId, ...parsed };

  replayCache.set(cacheKey, result);
  while (replayCache.size > REPLAY_CACHE_LIMIT) {
    const oldest = replayCache.keys().next().value;
    if (!oldest) break;
    replayCache.delete(oldest);
  }
  return result;
}

module.exports = { getMatchReplay, parseReplayTelemetry };
