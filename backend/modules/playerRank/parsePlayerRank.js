const { isAccountIdentifier } = require("../playerIdentity");
const { buildRankBadgeData } = require("./ranked");
const { mapPubgStatsToFrontend } = require("./statsMapper");
const { normalizeSeasonId } = require("./season");
const { resolveShard } = require("./platform");
const { createPubgApiClient } = require("./pubgApi");
const { createPlayerNameService } = require("./playerName");
const { createSteamAvatarService } = require("./steamAvatar");
const { createSeasonCatalogService } = require("./seasonCatalog");
const {
  CACHE_DURATION,
  CURRENT_SEASON_CACHE_DURATION,
  STEAM_CACHE_DURATION,
  inFlightRankRequests,
  isRateLimited,
  getStalePlayerData,
  lifetimeStatsCache,
  playerCache,
  playerNameCache,
  seasonCatalogCache,
  setRateLimited,
  setStalePlayerData,
  statsCache,
  steamAvatarCache,
} = require("./state");

function createParsePlayerRank({ pubgApiKey, steamApiKey }) {
  const { doRequest } = createPubgApiClient({
    apiKey: pubgApiKey,
    onRateLimit: setRateLimited,
  });

  const { ensurePlayerName, getCachedPlayerName, setCachedPlayerName } = createPlayerNameService({
    playerNameCache,
    isRateLimited,
    doRequest,
  });

  const { getBestEffortSteamAvatar } = createSteamAvatarService({
    steamApiKey,
    steamAvatarCache,
    steamCacheDuration: STEAM_CACHE_DURATION,
  });

  const { getSeasonCatalog } = createSeasonCatalogService({
    seasonCatalogCache,
    currentSeasonCacheDuration: CURRENT_SEASON_CACHE_DURATION,
    doRequest,
  });

  function repairCachedPayload({
    cachedPayload,
    requestedPlayerId,
    playerName,
    accountId,
    shard,
  }) {
    let nextPayload = cachedPayload;
    let changed = false;
    let nextPlayerName = playerName;

    const cachedHandle = nextPayload?.data?.platformInfo?.platformUserHandle;
    if (typeof cachedHandle === "string" && cachedHandle.trim() && !isAccountIdentifier(cachedHandle.trim())) {
      nextPlayerName = cachedHandle.trim();
      setCachedPlayerName(shard, accountId, nextPlayerName);
    } else if (!isAccountIdentifier(requestedPlayerId)) {
      nextPlayerName = requestedPlayerId;
      nextPayload = {
        ...nextPayload,
        data: {
          ...(nextPayload?.data || {}),
          platformInfo: {
            ...(nextPayload?.data?.platformInfo || {}),
            platformUserHandle: nextPlayerName,
          },
        },
      };
      changed = true;
    }

    const cachedRankedInfo = nextPayload?.data?.season?.rankedInfo;
    if (cachedRankedInfo?.tier) {
      const expectedBadge = buildRankBadgeData(cachedRankedInfo.tier, cachedRankedInfo.subTier);
      const expectedIconUrl = expectedBadge.iconUrl;
      const expectedFallbackUrl = expectedBadge.iconFallbackUrl;
      const currentIconUrl = cachedRankedInfo.iconUrl;
      const currentFallbackUrl = cachedRankedInfo.iconFallbackUrl;

      if (
        typeof expectedIconUrl === "string" &&
        (expectedIconUrl !== currentIconUrl || expectedFallbackUrl !== currentFallbackUrl)
      ) {
        const byMode = Array.isArray(cachedRankedInfo.byMode)
          ? cachedRankedInfo.byMode.map((entry) => {
              const badge = buildRankBadgeData(entry?.tier, entry?.subTier);
              return {
                ...entry,
                iconUrl: badge.iconUrl,
                iconFallbackUrl: badge.iconFallbackUrl,
              };
            })
          : cachedRankedInfo.byMode;

        nextPayload = {
          ...nextPayload,
          data: {
            ...(nextPayload?.data || {}),
            season: {
              ...(nextPayload?.data?.season || {}),
              rankedInfo: {
                ...cachedRankedInfo,
                iconUrl: expectedIconUrl,
                iconFallbackUrl: expectedFallbackUrl,
                byMode,
              },
            },
          },
        };

        changed = true;
      }
    }

    return {
      changed,
      payload: nextPayload,
      playerName: nextPlayerName,
    };
  }

  return async (platform, gameid, options = {}) => {
    const shard = resolveShard(platform);
    const requestedSeasonId = normalizeSeasonId(options?.seasonId);
    const requestedPlayerId = String(gameid || "").trim();
    const requestKey = `${shard}:${requestedPlayerId}:${requestedSeasonId || "current"}`;
    const staleByRequest = getStalePlayerData(requestKey);

    if (isRateLimited() && staleByRequest) {
      console.log(`[PUBG] Rate-limit cooldown, serving stale cache for ${requestedPlayerId}`);
      return staleByRequest;
    }

    const inFlight = inFlightRankRequests.get(requestKey);
    if (inFlight) {
      return inFlight;
    }

    const run = (async () => {
      try {
        const playerCacheKey = `${shard}:${requestedPlayerId}`;
        let accountId = playerCache.get(playerCacheKey);
        let playerName = requestedPlayerId;

        if (!accountId) {
          if (isAccountIdentifier(requestedPlayerId)) {
            accountId = requestedPlayerId;
            playerName = await ensurePlayerName(shard, accountId, requestedPlayerId);
          } else {
            if (isRateLimited() && staleByRequest) {
              console.log(`[PUBG] Skipping resolve due to cooldown, stale cache for ${requestedPlayerId}`);
              return staleByRequest;
            }

            console.log(`[PUBG] Resolving player: ${requestedPlayerId}`);
            const searchUrl =
              `https://api.pubg.com/shards/${shard}/players?` +
              `filter[playerNames]=${encodeURIComponent(requestedPlayerId)}`;
            const searchData = await doRequest(searchUrl);

            if (!searchData.data || searchData.data.length === 0) {
              throw new Error("Player not found");
            }

            accountId = searchData.data[0].id;
            playerName = searchData.data[0].attributes.name;
            playerCache.set(playerCacheKey, accountId);
            setCachedPlayerName(shard, accountId, playerName);
          }
        } else {
          console.log(`[PUBG] Cache hit for player ID: ${requestedPlayerId} -> ${accountId}`);
          if (isAccountIdentifier(requestedPlayerId) || requestedPlayerId === accountId) {
            playerName = await ensurePlayerName(
              shard,
              accountId,
              getCachedPlayerName(shard, accountId) || requestedPlayerId
            );
          } else {
            playerName = getCachedPlayerName(shard, accountId) || requestedPlayerId;
          }
        }

        if (isAccountIdentifier(playerName) && !isAccountIdentifier(requestedPlayerId)) {
          playerName = requestedPlayerId;
        }

        if (isAccountIdentifier(playerName)) {
          const resolvedName = await ensurePlayerName(shard, accountId, playerName);
          if (resolvedName && !isAccountIdentifier(resolvedName)) {
            playerName = resolvedName;
          }
        }

        let seasonCatalog = null;
        try {
          seasonCatalog = await getSeasonCatalog(shard);
        } catch (seasonCatalogError) {
          const cachedCatalog = seasonCatalogCache.get(shard);
          if (cachedCatalog?.data) {
            seasonCatalog = cachedCatalog.data;
            console.log(`[PUBG] Using cached season catalog for ${shard}: ${seasonCatalogError.message}`);
          } else {
            console.log(`[PUBG] Season catalog unavailable for ${shard}: ${seasonCatalogError.message}`);
          }
        }

        const seasonIds = new Set((seasonCatalog?.seasons || []).map((season) => season.id));
        const targetSeasonId =
          requestedSeasonId && (seasonIds.size === 0 || seasonIds.has(requestedSeasonId))
            ? requestedSeasonId
            : seasonCatalog?.currentSeasonId || requestedSeasonId || null;

        const statsCacheKey = `${shard}:${accountId}:${targetSeasonId || "no-season"}`;
        const cachedStats = statsCache.get(statsCacheKey);
        if (cachedStats && Date.now() - cachedStats.timestamp < CACHE_DURATION) {
          const normalized = repairCachedPayload({
            cachedPayload: cachedStats.data,
            requestedPlayerId,
            playerName,
            accountId,
            shard,
          });

          if (normalized.changed) {
            statsCache.set(statsCacheKey, {
              ...cachedStats,
              data: normalized.payload,
            });
            setStalePlayerData(requestKey, normalized.payload);
          }

          console.log(`[PUBG] Serving cached stats for ${normalized.playerName} (${targetSeasonId || "no-season"})`);
          return normalized.payload;
        }

        const lifetimeCacheKey = `${shard}:${accountId}:lifetime`;
        let lifetimeAttributes = null;
        const cachedLifetime = lifetimeStatsCache.get(lifetimeCacheKey);
        if (cachedLifetime && Date.now() - cachedLifetime.timestamp < CACHE_DURATION) {
          lifetimeAttributes = cachedLifetime.data;
        } else {
          console.log(`[PUBG] Fetching fresh stats for ${playerName}`);
          const lifetimeUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}/seasons/lifetime`;
          const lifetimeData = await doRequest(lifetimeUrl);

          if (!lifetimeData.data || !lifetimeData.data.attributes) {
            throw new Error("No stats found for this player");
          }

          lifetimeAttributes = lifetimeData.data.attributes;
          lifetimeStatsCache.set(lifetimeCacheKey, {
            data: lifetimeAttributes,
            timestamp: Date.now(),
          });
        }

        let seasonData = null;
        let rankedSeasonData = null;
        if (targetSeasonId) {
          try {
            const seasonStatsUrl = `https://api.pubg.com/shards/${shard}/players/${accountId}/seasons/${targetSeasonId}`;
            const seasonStatsData = await doRequest(seasonStatsUrl);

            if (seasonStatsData && seasonStatsData.data && seasonStatsData.data.attributes) {
              seasonData = {
                id: targetSeasonId,
                attributes: seasonStatsData.data.attributes,
              };
            }

            try {
              const rankedSeasonStatsUrl =
                `https://api.pubg.com/shards/${shard}/players/${accountId}/seasons/${targetSeasonId}/ranked`;
              const rankedSeasonStatsData = await doRequest(rankedSeasonStatsUrl);
              if (
                rankedSeasonStatsData &&
                rankedSeasonStatsData.data &&
                rankedSeasonStatsData.data.attributes &&
                rankedSeasonStatsData.data.attributes.rankedGameModeStats
              ) {
                rankedSeasonData = {
                  id: targetSeasonId,
                  attributes: rankedSeasonStatsData.data.attributes,
                };
              }
            } catch (rankedSeasonError) {
              console.log(`[PUBG] Ranked season stats unavailable for ${playerName}: ${rankedSeasonError.message}`);
            }
          } catch (seasonError) {
            console.log(`[PUBG] Season stats unavailable for ${playerName}: ${seasonError.message}`);
          }
        }

        const selectedSeasonId = seasonData?.id || targetSeasonId || seasonCatalog?.currentSeasonId || null;
        const displayPlayerName =
          isAccountIdentifier(playerName) && !isAccountIdentifier(requestedPlayerId)
            ? requestedPlayerId
            : playerName;

        setCachedPlayerName(shard, accountId, displayPlayerName);
        const mappedData = mapPubgStatsToFrontend(
          lifetimeAttributes,
          displayPlayerName,
          accountId,
          seasonData,
          rankedSeasonData,
          seasonCatalog,
          selectedSeasonId,
          shard,
          shard === "steam" ? await getBestEffortSteamAvatar(requestedPlayerId, displayPlayerName) : null
        );

        const cacheEntry = {
          data: mappedData,
          timestamp: Date.now(),
        };
        statsCache.set(statsCacheKey, cacheEntry);
        setStalePlayerData(requestKey, mappedData);
        if (displayPlayerName && displayPlayerName !== requestedPlayerId && !isAccountIdentifier(displayPlayerName)) {
          setStalePlayerData(`${shard}:${displayPlayerName}:${requestedSeasonId || "current"}`, mappedData);
        }

        return mappedData;
      } catch (e) {
        if (String(e.message).includes("Rate Limit")) {
          const stale =
            staleByRequest ||
            getStalePlayerData(requestKey) ||
            getStalePlayerData(`${shard}:${requestedPlayerId}:current`);
          if (stale) {
            console.log(`[PUBG] Rate limited, serving stale cache for ${requestedPlayerId}`);
            return stale;
          }
        }

        console.log("PUBG API Error:", e.message);
        throw Error(e.message);
      } finally {
        inFlightRankRequests.delete(requestKey);
      }
    })();

    inFlightRankRequests.set(requestKey, run);
    return run;
  };
}

module.exports = {
  createParsePlayerRank,
};
