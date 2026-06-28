const { shardForMatch, fetchPubgJson, fetchTelemetryJson, findTelemetryUrl } = require("./pubgTelemetry");
const { getMapMeta } = require("./mapMeta");

const replayCache = new Map();
const REPLAY_CACHE_LIMIT = 30;

function readXY(loc) {
  if (!loc) return null;
  const x = Number(loc.x);
  const y = Number(loc.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x / 100), y: Math.round(y / 100) };
}

function eventTime(ev, matchStartMs) {
  if (Number.isFinite(ev?.elapsedTime)) return Math.round(ev.elapsedTime);
  const ms = Date.parse(ev?._D);
  if (Number.isFinite(ms) && Number.isFinite(matchStartMs)) {
    return Math.max(0, Math.round((ms - matchStartMs) / 1000));
  }
  return null;
}

function lower(s) {
  return typeof s === "string" ? s.trim().toLowerCase() : null;
}

function parseReplayTelemetry(telemetry, { matchAttributes = {}, accountId = null, playerName = null } = {}) {
  const rawMapName = matchAttributes.mapName || "";
  const meta = getMapMeta(rawMapName);
  const matchStartMs = Date.parse(matchAttributes.createdAt || "");
  const duration = Number(matchAttributes.duration) || 0;

  const roster = new Map();
  const positions = new Map();
  const deathTime = new Map();
  const kills = [];

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
      const t = eventTime(ev, matchStartMs);
      if (t === null) continue;
      if (!roster.has(ch.accountId)) roster.set(ch.accountId, { name: ch.name, teamId: ch.teamId });
      if (!positions.has(ch.accountId)) positions.set(ch.accountId, []);
      positions.get(ch.accountId).push({ t, x: xy.x, y: xy.y });
      continue;
    }

    if (type === "LogPlayerKillV2") {
      const victim = ev.victim;
      const killer = ev.killer || ev.finisher || null;
      const t = eventTime(ev, matchStartMs);
      if (victim?.accountId && t !== null) deathTime.set(victim.accountId, t);
      const vxy = readXY(victim?.location);
      const kxy = readXY(killer?.location);
      if (vxy && kxy && t !== null) {
        kills.push({ t, killer: killer?.name || null, victim: victim?.name || null, kx: kxy.x, ky: kxy.y, vx: vxy.x, vy: vxy.y });
      }
      continue;
    }
  }

  let focalTeam = null;
  for (const [id, info] of roster) {
    if ((accountKey && id === accountKey) || (lowerName && lower(info.name) === lowerName)) {
      focalTeam = info.teamId;
      break;
    }
  }

  const players = [];
  for (const [id, posArr] of positions) {
    const info = roster.get(id) || {};
    posArr.sort((a, b) => a.t - b.t);
    const isFocal =
      (accountKey && id === accountKey) ||
      (lowerName && lower(info.name) === lowerName) ||
      (focalTeam != null && info.teamId === focalTeam);
    players.push({
      name: info.name || id,
      accountId: id,
      teamId: info.teamId ?? null,
      isFocal: !!isFocal,
      positions: posArr,
      deathTime: deathTime.has(id) ? deathTime.get(id) : null,
    });
  }
  kills.sort((a, b) => a.t - b.t);

  return {
    rawMapName,
    mapName: meta.displayName,
    mapMax: meta.mapMax,
    duration,
    createdAt: matchAttributes.createdAt || null,
    players,
    kills,
  };
}

async function getMatchReplay({ shard, matchId, accountId, playerName }) {
  if (!matchId) throw new Error("matchId is required");
  const matchShard = shardForMatch(shard);
  const cacheKey = `${matchShard}:${matchId}`;
  if (replayCache.has(cacheKey)) return replayCache.get(cacheKey);

  const matchUrl = `https://api.pubg.com/shards/${matchShard}/matches/${encodeURIComponent(matchId)}`;
  const matchPayload = await fetchPubgJson(matchUrl, true);
  const matchAttributes = matchPayload?.data?.attributes || {};
  const telemetryUrl = findTelemetryUrl(matchPayload);
  if (!telemetryUrl) throw new Error("Telemetry asset unavailable for this match");

  const telemetry = await fetchTelemetryJson(telemetryUrl);
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
