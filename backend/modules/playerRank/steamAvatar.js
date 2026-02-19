function normalizeSteamCandidate(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const profileMatch = raw.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return profileMatch[1];

  const idMatch = raw.match(/steamcommunity\.com\/id\/([^\/\?\#]+)/i);
  if (idMatch) return idMatch[1];

  return raw;
}

function createSteamAvatarService({ steamApiKey, steamAvatarCache, steamCacheDuration }) {
  async function getSteamAvatarByCandidate(candidate) {
    if (!steamApiKey) return null;
    const normalized = normalizeSteamCandidate(candidate);
    if (!normalized) return null;

    const cached = steamAvatarCache.get(normalized);
    if (cached && Date.now() - cached.timestamp < steamCacheDuration) {
      return cached.data;
    }

    let steamId64 = null;
    if (/^\d{17}$/.test(normalized)) {
      steamId64 = normalized;
    } else {
      steamAvatarCache.set(normalized, { data: null, timestamp: Date.now() });
      return null;
    }

    const summaryUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/` +
      `?key=${steamApiKey}&steamids=${steamId64}`;
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) {
      steamAvatarCache.set(normalized, { data: null, timestamp: Date.now() });
      return null;
    }

    const summaryData = await summaryResponse.json();
    const player = summaryData?.response?.players?.[0];
    const avatarUrl = player?.avatarfull || player?.avatarmedium || player?.avatar || null;
    const result = avatarUrl
      ? {
        avatarUrl,
        steamId64,
      }
      : null;

    steamAvatarCache.set(normalized, { data: result, timestamp: Date.now() });
    return result;
  }

  async function getBestEffortSteamAvatar(gameid, playerName) {
    if (!steamApiKey) return null;

    const candidates = [gameid, playerName];
    for (const candidate of candidates) {
      try {
        const profile = await getSteamAvatarByCandidate(candidate);
        if (profile?.avatarUrl) {
          return profile.avatarUrl;
        }
      } catch (e) {
        console.log(`[STEAM] Avatar resolve failed for ${candidate}: ${e.message}`);
      }
    }

    return null;
  }

  return {
    getBestEffortSteamAvatar,
  };
}

module.exports = {
  createSteamAvatarService,
};
