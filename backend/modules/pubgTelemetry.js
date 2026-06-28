const PUBG_API_KEY = process.env.PUBG_API_KEY || "";

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

module.exports = { shardForMatch, fetchPubgJson, fetchTelemetryJson, findTelemetryUrl };
