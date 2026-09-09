const PUBG_API_KEY = process.env.PUBG_API_KEY || "";
const { assertShard } = require("./pubgUrlSafety");

function shardForMatch(shard) {
  const normalized = assertShard(shard);
  if (normalized === "psn" || normalized === "xbox") return "console";
  return normalized;
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
  const text = await response.text();
  return { telemetry: JSON.parse(text), bytes: Buffer.byteLength(text) };
}

// Telemetry files run ~24 MB, and the one field the match cards want -- the
// server region -- sits in the first events. The CDN honours Range and gzips
// the body, so a few kilobytes over the wire arrive as a few hundred of JSON.
// This host is not the rate-limited API and needs no key.
const TELEMETRY_HEAD_BYTES = 16 * 1024;
const TELEMETRY_HEAD_TIMEOUT_MS = 3000;

async function fetchTelemetryHead(url, bytes = TELEMETRY_HEAD_BYTES) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", Range: `bytes=0-${bytes - 1}` },
      signal: AbortSignal.timeout(TELEMETRY_HEAD_TIMEOUT_MS),
    });

    if (!response.ok) return null;
    // 206 means a range was served. Anything else means the whole file is on
    // its way, so drop the stream rather than download megabytes for two
    // letters.
    if (response.status !== 206) {
      await response.body?.cancel?.();
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
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

module.exports = {
  shardForMatch,
  fetchPubgJson,
  fetchTelemetryJson,
  fetchTelemetryHead,
  findTelemetryUrl,
};
