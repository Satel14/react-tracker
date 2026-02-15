function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTierName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeSubTier(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return String(Math.floor(asNumber));
  }

  return raw;
}

function tierTitleCase(tier) {
  const normalized = normalizeTierName(tier);
  if (!normalized) return "Unranked";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toTierScore(tier, subTier) {
  const order = {
    unranked: 0,
    bronze: 10,
    silver: 20,
    gold: 30,
    platinum: 40,
    diamond: 50,
    master: 60,
    grandmaster: 70,
    survivor: 75,
    top500: 80,
  };

  const normalizedTier = normalizeTierName(tier) || "unranked";
  const base = order[normalizedTier] || 0;
  const sub = toNumberOrNull(subTier);
  if (!sub) return base;

  // Higher division should produce slightly higher score (I > II > III ...)
  return base + Math.max(0, 10 - sub);
}

const LOCAL_PUBG_RANK_ICON_URLS = {
  unranked: "/images/ranks/opgg/unranked.png",
  bronze: "/images/ranks/opgg/bronze-1.png",
  silver: "/images/ranks/opgg/silver-1.png",
  gold: "/images/ranks/opgg/gold-1.png",
  platinum: "/images/ranks/opgg/platinum-1.png",
  diamond: "/images/ranks/opgg/diamond-1.png",
  elite: "/images/ranks/opgg/diamond-1.png",
  master: "/images/ranks/opgg/master-1.png",
  grandmaster: "/images/ranks/opgg/survivor-1.png",
  survivor: "/images/ranks/opgg/survivor-1.png",
  top500: "/images/ranks/opgg/survivor-1.png",
};

function toSubTierNumber(value) {
  const normalized = normalizeSubTier(value);
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.max(1, Math.min(5, Math.floor(numeric)));
  }

  const roman = normalized.toUpperCase();
  const romanMap = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
  };

  return romanMap[roman] || null;
}

function buildLocalOpggCompetitiveRankIconPath(tier, subTier) {
  const normalizedTier = normalizeTierName(tier) || "unranked";
  const withDivision = new Set(["bronze", "silver", "gold", "platinum", "diamond", "survivor"]);

  if (withDivision.has(normalizedTier)) {
    const subTierNumber = toSubTierNumber(subTier) || 1;
    return `/images/ranks/opgg/${normalizedTier}-${subTierNumber}.png`;
  }

  if (normalizedTier === "master") {
    return "/images/ranks/opgg/master-1.png";
  }

  if (normalizedTier === "grandmaster") {
    return LOCAL_PUBG_RANK_ICON_URLS.grandmaster;
  }

  if (normalizedTier === "top500") {
    return LOCAL_PUBG_RANK_ICON_URLS.top500;
  }

  return "/images/ranks/opgg/unranked.png";
}

function buildLocalRankIconUrl(tier) {
  const normalizedTier = normalizeTierName(tier) || "unranked";
  return LOCAL_PUBG_RANK_ICON_URLS[normalizedTier] || LOCAL_PUBG_RANK_ICON_URLS.unranked;
}

function buildRankBadgeData(tier, subTier) {
  const primary = buildLocalOpggCompetitiveRankIconPath(tier, subTier);
  const fallback = buildLocalRankIconUrl(tier);
  return {
    iconUrl: primary || fallback,
    iconFallbackUrl: fallback,
  };
}

function extractTierInfo(rawTier = null) {
  if (!rawTier || typeof rawTier !== "object") return null;
  const tier = normalizeTierName(rawTier.tier);
  const subTier = normalizeSubTier(rawTier.subTier);
  if (!tier) return null;

  return {
    tier,
    subTier,
    label: subTier ? `${tierTitleCase(tier)} ${subTier}` : tierTitleCase(tier),
  };
}

function extractRankedInfo(rankedModeStats = {}) {
  const entries = Object.entries(rankedModeStats || {});
  if (!entries.length) return null;

  const modeSummaries = [];
  let best = null;

  entries.forEach(([mode, stats]) => {
    const currentTier = extractTierInfo(stats?.currentTier);
    const bestTier = extractTierInfo(stats?.bestTier);
    const chosenTier = currentTier || bestTier;
    if (!chosenTier) return;

    const rankPoints = toNumberOrNull(stats?.currentRankPoint);
    const bestRankPoints = toNumberOrNull(stats?.bestRankPoint);
    const score = toTierScore(chosenTier.tier, chosenTier.subTier) + (rankPoints || 0) / 10000;
    const rankBadge = buildRankBadgeData(chosenTier.tier, chosenTier.subTier);

    const summary = {
      mode,
      tier: chosenTier.tier,
      subTier: chosenTier.subTier,
      label: chosenTier.label,
      currentRankPoint: rankPoints,
      bestRankPoint: bestRankPoints,
      iconUrl: rankBadge.iconUrl,
      iconFallbackUrl: rankBadge.iconFallbackUrl,
      score,
    };

    modeSummaries.push(summary);
    if (!best || summary.score > best.score) {
      best = summary;
    }
  });

  if (!best) return null;

  return {
    tier: best.tier,
    subTier: best.subTier,
    label: best.label,
    mode: best.mode,
    currentRankPoint: best.currentRankPoint,
    bestRankPoint: best.bestRankPoint,
    iconUrl: best.iconUrl,
    byMode: modeSummaries
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...rest }) => rest),
  };
}

module.exports = {
  buildRankBadgeData,
  extractRankedInfo,
};
