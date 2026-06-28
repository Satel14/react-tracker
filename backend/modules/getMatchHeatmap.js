const PUBG_API_KEY = process.env.PUBG_API_KEY || "";

const { getMapMeta } = require("./mapMeta");
const { aggregateKey, addMatchPoints } = require("./heatmapAggregate");

const heatmapCache = new Map();
const inFlightHeatmap = new Map();

const HEATMAP_CACHE_LIMIT = 200;

function shardForMatch(shard) {
  if (shard === "psn" || shard === "xbox") return "console";
  return shard;
}

async function fetchPubgJson(url, useApiKey = false) {
  const headers = { Accept: "application/vnd.api+json" };
  if (useApiKey) headers.Authorization = `Bearer ${PUBG_API_KEY}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Match not found");
    if (response.status === 401) throw new Error("API Key Invalid");
    if (response.status === 429) throw new Error("Rate Limit Reached");
    throw new Error(`PUBG fetch failed: ${response.status}`);
  }
  return response.json();
}

async function fetchTelemetryJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Telemetry fetch failed: ${response.status}`);
  return response.json();
}

function findTelemetryUrl(matchPayload) {
  const included = Array.isArray(matchPayload?.included) ? matchPayload.included : [];
  const assetRefs = matchPayload?.data?.relationships?.assets?.data || [];
  const assetIds = new Set(assetRefs.map((ref) => ref?.id).filter(Boolean));

  for (const item of included) {
    if (item?.type !== "asset") continue;
    if (assetIds.size && !assetIds.has(item.id)) continue;
    const url = item?.attributes?.URL;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return null;
}

function isOurPlayer(actor, accountId, lowerName) {
  if (!actor) return false;
  if (accountId && actor.accountId === accountId) return true;
  if (lowerName && typeof actor.name === "string" && actor.name.toLowerCase() === lowerName) return true;
  return false;
}

function readLocation(source) {
  if (!source || !source.location) return null;
  const x = Number(source.location.x);
  const y = Number(source.location.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x / 100), y: Math.round(y / 100) };
}

function diffSeconds(eventTime, matchStart) {
  if (!eventTime || !matchStart) return null;
  const e = Date.parse(eventTime);
  const s = Date.parse(matchStart);
  if (Number.isNaN(e) || Number.isNaN(s)) return null;
  return Math.max(0, Math.round((e - s) / 1000));
}

function trimCache() {
  while (heatmapCache.size > HEATMAP_CACHE_LIMIT) {
    const oldestKey = heatmapCache.keys().next().value;
    if (!oldestKey) break;
    heatmapCache.delete(oldestKey);
  }
}

async function buildHeatmap({ shard, matchId, accountId, playerName }) {
  const matchShard = shardForMatch(shard);
  const matchUrl = `https://api.pubg.com/shards/${matchShard}/matches/${encodeURIComponent(matchId)}`;
  const matchPayload = await fetchPubgJson(matchUrl, true);

  const matchAttributes = matchPayload?.data?.attributes || {};
  const rawMapName = matchAttributes.mapName || "";
  const mapMeta = getMapMeta(rawMapName);
  const matchStart = matchAttributes.createdAt || null;

  const telemetryUrl = findTelemetryUrl(matchPayload);
  if (!telemetryUrl) throw new Error("Telemetry asset unavailable for this match");

  const telemetry = await fetchTelemetryJson(telemetryUrl);
  if (!Array.isArray(telemetry)) throw new Error("Telemetry payload malformed");

  const lowerName = typeof playerName === "string" && playerName.trim()
    ? playerName.trim().toLowerCase()
    : null;
  const accountKey = typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;

  const events = [];
  let resolvedName = lowerName;
  let dropPushed = false;

  for (const event of telemetry) {
    const type = event?._T;
    if (!type) continue;

    if (type === "LogParachuteLanding") {
      if (dropPushed) continue;
      if (!isOurPlayer(event.character, accountKey, resolvedName)) continue;
      const loc = readLocation(event.character);
      if (!loc) continue;
      events.push({
        type: "drop",
        x: loc.x,
        y: loc.y,
        time: diffSeconds(event._D, matchStart),
      });
      dropPushed = true;
      continue;
    }

    if (type === "LogPlayerKillV2") {
      const killer = event.killer || event.dmgInfo?.killerName ? event.killer : null;
      const finisher = event.finisher || null;
      const victim = event.victim || null;

      const meIsKiller =
        isOurPlayer(killer, accountKey, resolvedName) ||
        isOurPlayer(finisher, accountKey, resolvedName);
      const meIsVictim = isOurPlayer(victim, accountKey, resolvedName);

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
        const loc = readLocation(victim);
        if (!loc) continue;
        events.push({
          type: "kill",
          x: loc.x,
          y: loc.y,
          time: diffSeconds(event._D, matchStart),
          victim: victim?.name || null,
          weapon,
          distance,
        });
      }

      if (meIsVictim) {
        const loc = readLocation(victim);
        if (!loc) continue;
        events.push({
          type: "death",
          x: loc.x,
          y: loc.y,
          time: diffSeconds(event._D, matchStart),
          killer: killer?.name || finisher?.name || null,
          weapon,
          distance,
        });
      }

      continue;
    }
  }

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

module.exports = { getMatchHeatmap, shardForMatch };
