const { getMapMeta } = require("./mapMeta");
const { aggregateKey, addMatchPoints } = require("./heatmapAggregate");
const { shardForMatch } = require("./pubgTelemetry");
const { loadMatchBundle } = require("./matchLoader");
const { readXY, eventTime, isFocalActor } = require("./telemetryUtils");
const { isRateLimited } = require("./playerRank/state");

const heatmapCache = new Map();
const inFlightHeatmap = new Map();

const HEATMAP_CACHE_LIMIT = 200;

function trimCache() {
  while (heatmapCache.size > HEATMAP_CACHE_LIMIT) {
    const oldestKey = heatmapCache.keys().next().value;
    if (!oldestKey) break;
    heatmapCache.delete(oldestKey);
  }
}

function extractHeatmapEvents(telemetry, { matchStartMs = 0, accountId = null, playerName = null } = {}) {
  const lowerName = typeof playerName === "string" && playerName.trim()
    ? playerName.trim().toLowerCase()
    : null;
  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;

  const events = [];
  const resolvedName = lowerName;
  let dropPushed = false;

  for (const event of Array.isArray(telemetry) ? telemetry : []) {
    const type = event?._T;
    if (!type) continue;

    if (type === "LogParachuteLanding") {
      if (dropPushed) continue;
      if (!isFocalActor(event.character, accountKey, resolvedName)) continue;
      const loc = readXY(event.character?.location);
      if (!loc) continue;
      events.push({
        type: "drop",
        x: loc.x,
        y: loc.y,
        time: eventTime(event, matchStartMs),
      });
      dropPushed = true;
      continue;
    }

    if (type === "LogPlayerKillV2") {
      const killer = event.killer || (event.dmgInfo?.killerName ? { name: event.dmgInfo.killerName } : null);
      const finisher = event.finisher || null;
      const victim = event.victim || null;

      const meIsKiller =
        isFocalActor(killer, accountKey, resolvedName) ||
        isFocalActor(finisher, accountKey, resolvedName);
      const meIsVictim = isFocalActor(victim, accountKey, resolvedName);

      if (!meIsKiller && !meIsVictim) continue;

      const weapon =
        event.killerDamageInfo?.damageCauserName ||
        event.finishDamageInfo?.damageCauserName ||
        event.damageCauserName ||
        null;

      const distance =
        event.killerDamageInfo?.distance !== undefined
          ? Math.round(Number(event.killerDamageInfo.distance) / 100)
          : event.finishDamageInfo?.distance !== undefined
            ? Math.round(Number(event.finishDamageInfo.distance) / 100)
            : null;

      if (meIsKiller) {
        const loc = readXY(victim?.location);
        if (!loc) continue;
        events.push({
          type: "kill",
          x: loc.x,
          y: loc.y,
          time: eventTime(event, matchStartMs),
          victim: victim?.name || null,
          weapon,
          distance,
        });
      }

      if (meIsVictim) {
        const loc = readXY(victim?.location);
        if (!loc) continue;
        events.push({
          type: "death",
          x: loc.x,
          y: loc.y,
          time: eventTime(event, matchStartMs),
          killer: killer?.name || finisher?.name || null,
          weapon,
          distance,
        });
      }

      continue;
    }
  }

  return events;
}

async function buildHeatmap({ shard, matchId, accountId, playerName }) {
  const bundle = await loadMatchBundle({ shard, matchId });
  const matchAttributes = bundle.matchAttributes || {};
  const rawMapName = matchAttributes.mapName || "";
  const mapMeta = getMapMeta(rawMapName);
  const matchStart = matchAttributes.createdAt || null;
  const matchStartMs = matchStart ? Date.parse(matchStart) : NaN;

  const telemetry = bundle.telemetry;
  if (!Array.isArray(telemetry)) throw new Error("Telemetry payload malformed");

  const events = extractHeatmapEvents(telemetry, { matchStartMs, accountId, playerName });

  const points = { drop: [], kill: [], death: [] };
  for (const ev of events) {
    if (points[ev.type]) points[ev.type].push({ x: ev.x, y: ev.y });
  }
  if (rawMapName && (accountId || playerName)) {
    const key = aggregateKey({ shard: shardForMatch(shard), accountId, playerName, rawMapName });
    addMatchPoints({ key, matchId, points }).catch(() => {});
  }

  return {
    matchId,
    rawMapName,
    mapName: mapMeta.displayName,
    mapSize: mapMeta.mapMax,
    duration: Number(matchAttributes.duration) || null,
    createdAt: matchStart,
    events,
  };
}

async function getMatchHeatmap({ shard, matchId, accountId, playerName }) {
  if (!matchId) throw new Error("matchId is required");
  if (!accountId && !playerName) throw new Error("accountId or playerName is required");

  const cacheKey = `${shardForMatch(shard)}:${matchId}:${accountId || playerName}`;
  const cached = heatmapCache.get(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightHeatmap.get(cacheKey);
  if (inFlight) return inFlight;

  const run = (async () => {
    try {
      const result = await buildHeatmap({ shard, matchId, accountId, playerName });
      heatmapCache.set(cacheKey, result);
      trimCache();
      return result;
    } finally {
      inFlightHeatmap.delete(cacheKey);
    }
  })();

  inFlightHeatmap.set(cacheKey, run);
  return run;
}

async function warmHeatmapMatches({ shard, matchIds, accountId = null, playerName = null }, deps = {}) {
  const buildOne = deps.buildOne || getMatchHeatmap;
  const rateLimited = deps.isRateLimited || isRateLimited;
  const ids = Array.isArray(matchIds) ? matchIds.slice(0, 12) : [];
  for (const matchId of ids) {
    if (rateLimited()) break;
    try {
      await buildOne({ shard, matchId, accountId, playerName });
    } catch (_e) {
      // skip matches that fail to build (404 after retention, rate limit, etc.)
    }
  }
}

module.exports = { getMatchHeatmap, extractHeatmapEvents, warmHeatmapMatches, shardForMatch };
