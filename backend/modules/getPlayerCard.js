const { Resvg } = require("@resvg/resvg-js");
const { parsePlayerRank } = require("./getPlayerRank");

const cardCache = new Map();
const inFlight = new Map();
const CARD_TTL = 5 * 60 * 1000;
const CACHE_LIMIT = 100;

const TIER_COLOR = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#fde82b",
  platinum: "#78e6e6",
  diamond: "#78b4ff",
  master: "#dc6ee6",
  grandmaster: "#dc6ee6",
  survivor: "#ffdc64",
  top500: "#ffdc64",
};

function escapeXml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function trimCache() {
  while (cardCache.size > CACHE_LIMIT) {
    const oldest = cardCache.keys().next().value;
    if (!oldest) break;
    cardCache.delete(oldest);
  }
}

function buildSvg(player) {
  const platformInfo = player?.platformInfo || {};
  const stats = player?.segments?.[0]?.stats || {};
  const rankedInfo = player?.season?.rankedInfo || null;

  const nickname = escapeXml(platformInfo.platformUserHandle || "Unknown");
  const platform = escapeXml((platformInfo.platformSlug || "steam").toUpperCase());
  const rankLabel = escapeXml(rankedInfo?.label || "Unranked");
  const tierKey = String(rankedInfo?.tier || "").toLowerCase();
  const tierColor = TIER_COLOR[tierKey] || "#78f7a8";
  const rp = Number(rankedInfo?.currentRankPoint);
  const rpLabel = Number.isFinite(rp) ? rp.toLocaleString("en-US") : null;

  const kd = escapeXml(stats?.kd?.displayValue || "0");
  const winPct = escapeXml(stats?.wlPercentage?.displayValue || "0%");
  const avgDmg = escapeXml(stats?.avgDamage?.displayValue || "0");
  const matches = escapeXml(stats?.matchesPlayed?.displayValue || "0");

  const W = 1200;
  const H = 630;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c1220" />
      <stop offset="100%" stop-color="#020409" />
    </linearGradient>
    <radialGradient id="glow" cx="22%" cy="28%" r="40%">
      <stop offset="0%" stop-color="${tierColor}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="${tierColor}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)" />
  <rect width="${W}" height="${H}" fill="url(#glow)" />

  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="22"
    fill="none" stroke="${tierColor}" stroke-opacity="0.5" stroke-width="2" />

  <text x="60" y="100" font-family="Arial Black, sans-serif" font-size="48" fill="#ffffff" font-weight="900" letter-spacing="2">
    ${nickname}
  </text>

  <text x="60" y="148" font-family="Arial, sans-serif" font-size="24" fill="${tierColor}" font-weight="700" letter-spacing="3">
    ${platform} - ${rankLabel}${rpLabel ? ` - ${rpLabel} RP` : ""}
  </text>

  <line x1="60" y1="190" x2="${W - 60}" y2="190" stroke="${tierColor}" stroke-opacity="0.3" stroke-width="2" />

  <g transform="translate(60, 240)">
    <text font-family="Arial, sans-serif" font-size="18" fill="#9da1bf" letter-spacing="3" font-weight="700">K/D</text>
    <text y="80" font-family="Arial Black, sans-serif" font-size="84" fill="#ffffff" font-weight="900">${kd}</text>
  </g>

  <g transform="translate(360, 240)">
    <text font-family="Arial, sans-serif" font-size="18" fill="#9da1bf" letter-spacing="3" font-weight="700">WIN %</text>
    <text y="80" font-family="Arial Black, sans-serif" font-size="84" fill="${tierColor}" font-weight="900">${winPct}</text>
  </g>

  <g transform="translate(660, 240)">
    <text font-family="Arial, sans-serif" font-size="18" fill="#9da1bf" letter-spacing="3" font-weight="700">AVG DMG</text>
    <text y="80" font-family="Arial Black, sans-serif" font-size="84" fill="#ffffff" font-weight="900">${avgDmg}</text>
  </g>

  <g transform="translate(960, 240)">
    <text font-family="Arial, sans-serif" font-size="18" fill="#9da1bf" letter-spacing="3" font-weight="700">MATCHES</text>
    <text y="80" font-family="Arial Black, sans-serif" font-size="84" fill="#ffffff" font-weight="900">${matches}</text>
  </g>

  <text x="60" y="${H - 50}" font-family="Arial, sans-serif" font-size="20" fill="#6a6e88" letter-spacing="3" font-weight="700">
    PUBG TRACKER
  </text>

  <text x="${W - 60}" y="${H - 50}" font-family="Arial, sans-serif" font-size="16" fill="#6a6e88" letter-spacing="2" font-weight="600" text-anchor="end">
    pubgtracker.onrender.com
  </text>
</svg>`;
}

async function buildCardPng({ platform, gameId }) {
  const data = await parsePlayerRank(platform, gameId, {});
  if (!data || !data.platformInfo) {
    throw new Error("Player not found");
  }

  const svg = buildSvg(data);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    background: "rgba(0, 0, 0, 0)",
  });
  const pngBuffer = resvg.render().asPng();
  return pngBuffer;
}

async function getPlayerCard({ platform, gameId }) {
  const cacheKey = `${platform}:${gameId}`;
  const cached = cardCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CARD_TTL) {
    return cached.buffer;
  }

  const inFlightRequest = inFlight.get(cacheKey);
  if (inFlightRequest) return inFlightRequest;

  const run = (async () => {
    try {
      const buffer = await buildCardPng({ platform, gameId });
      cardCache.set(cacheKey, { buffer, timestamp: Date.now() });
      trimCache();
      return buffer;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, run);
  return run;
}

module.exports = {
  getPlayerCard,
};
