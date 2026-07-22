const { isAccountIdentifier } = require("../playerIdentity");
const { isStrictAccountId, encodeSegment } = require("../pubgUrlSafety");
const { buildRankBadgeData } = require("./ranked");
const { mapPubgStatsToFrontend } = require("./statsMapper");
const { normalizeSeasonId } = require("./season");
const { resolveShard } = require("./platform");
const { createPubgApiClient } = require("./pubgApi");
const { createPlayerNameService } = require("./playerName");
const { createSteamAvatarService } = require("./steamAvatar");
const { createSeasonCatalogService } = require("./seasonCatalog");
const { createEmptyMatches, createPlayerEnrichmentService } = require("./enrichment");
const {
  CACHE_DURATION,
  CURRENT_SEASON_CACHE_DURATION,
  STEAM_CACHE_DURATION,
  clanCache,
  inFlightRankRequests,
  isRateLimited,
  getStalePlayerData,
  lifetimeStatsCache,
  masteryCache,
  matchSummaryCache,
  playerCache,
  playerProfileCache,
  playerNameCache,
  seasonCatalogCache,
  setRateLimited,
  setStalePlayerData,
  statsCache,
  steamAvatarCache,
  extrasCache,
  inFlightExtrasRequests,
  EXTRAS_RETRY_COOLDOWN_MS,
} = require("./state");

function shouldReenrich(profile) {
  return !profile || (profile.status !== "ok" && profile.status !== "deferred");
}

function createProfileExtrasError(error, fallbackProfile = null) {
  return {
    profile: {
      status: "error",
      error: error?.message || String(error || "Profile extras failed"),
      banType: fallbackProfile?.banType || null,
      clan: fallbackProfile?.clan || null,
      survivalMastery: fallbackProfile?.survivalMastery || null,
      weaponMastery: fallbackProfile?.weaponMastery || null,
    },
    matches: createEmptyMatches(),
  };
}

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

  const { getPlayerProfile, getMatchExtras, getMasteryExtras } = createPlayerEnrichmentService({
    doRequest,
    clanCache,
    masteryCache,
    matchSummaryCache,
    profileCache: playerProfileCache,
    cacheDuration: CACHE_DURATION,
  });

  async function enrichCachedPayload({
    payload,
    statsCacheKey,
    cachedStats,
    requestKey,
    shard,
    accountId,
    playerName,
    playerRecord,
  }) {
    const cachedData = payload?.data || {};
    const hasProfileExtras = Object.prototype.hasOwnProperty.call(cachedData, "profile");
    const hasMatchExtras = Object.prototype.hasOwnProperty.call(cachedData, "matches");

    if (hasProfileExtras && hasMatchExtras && !shouldReenrich(cachedData.profile)) {
      return payload;
    }

    try {
      const profileExtras = await getMatchExtras({
        shard,
        accountId,
        playerName,
        playerRecord,
      });

      const enrichedPayload = {
        ...payload,
        data: {
          ...cachedData,
          profile: profileExtras?.profile || cachedData.profile || null,
          matches: profileExtras?.matches || cachedData.matches || { summary: { total: 0 }, items: [] },
        },
      };

      statsCache.set(statsCacheKey, {
        ...cachedStats,
        data: enrichedPayload,
      });
      setStalePlayerData(requestKey, enrichedPayload);

      return enrichedPayload;
    } catch (profileExtrasError) {
      console.log(`[PUBG] Cached profile extras unavailable for ${playerName}: ${profileExtrasError.message}`);
      const enrichedPayload = {
        ...payload,
        data: {
          ...cachedData,
          ...createProfileExtrasError(profileExtrasError, cachedData.profile),
        },
      };

      statsCache.set(statsCacheKey, {
        ...cachedStats,
        data: enrichedPayload,
      });
      setStalePlayerData(requestKey, enrichedPayload);

      return enrichedPayload;
    }
  }

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

  const parsePlayerRank = async (platform, gameid, options = {}) => {
    const shard = resolveShard(platform);
    const requestedSeasonId = normalizeSeasonId(options?.seasonId);
    const requestedPlayerId = String(gameid || "").trim();
    const requestKey = `${shard}:${requestedPlayerId}:${requestedSeasonId || "current"}`;
    const staleByRequest = getStalePlayerData(requestKey);

    const inFlight = inFlightRankRequests.get(requestKey);
    if (inFlight) {
      return inFlight;
    }

    if (isRateLimited()) {
      if (staleByRequest) {
        console.log(`[PUBG] Rate-limit cooldown, serving stale cache for ${requestedPlayerId}`);
        return staleByRequest;
      }
      console.log(`[PUBG] Rate-limit cooldown, failing fast for ${requestedPlayerId}`);
      throw new Error("Rate Limit Reached");
    }

    const run = (async () => {
      try {
        const playerCacheKey = `${shard}:${requestedPlayerId}`;
        let accountId = playerCache.get(playerCacheKey);
        let playerName = requestedPlayerId;
        let playerRecord = null;

        if (!accountId) {
          if (isStrictAccountId(requestedPlayerId)) {
            accountId = requestedPlayerId;
            try {
              playerRecord = await getPlayerProfile(shard, accountId);
            } catch (profileError) {
              console.log(`[PUBG] Player profile unavailable for ${accountId}: ${profileError.message}`);
            }
            const resolvedName = playerRecord?.attributes?.name;
            if (typeof resolvedName === "string" && resolvedName.trim()) {
              playerName = resolvedName.trim();
              setCachedPlayerName(shard, accountId, playerName);
            } else {
              playerName = await ensurePlayerName(shard, accountId, requestedPlayerId);
            }
          } else {
            console.log(`[PUBG] Resolving player: ${requestedPlayerId}`);
            const searchUrl =
              `https://api.pubg.com/shards/${encodeSegment(shard)}/players?` +
              `filter[playerNames]=${encodeSegment(requestedPlayerId)}`;
            const searchData = await doRequest(searchUrl);

            if (!searchData.data || searchData.data.length === 0) {
              throw new Error("Player not found");
            }

            playerRecord = searchData.data[0];
            accountId = playerRecord.id;
            playerName = playerRecord.attributes.name;
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
          return enrichCachedPayload({
            payload: normalized.payload,
            statsCacheKey,
            cachedStats,
            requestKey,
            shard,
            accountId,
            playerName: normalized.playerName,
            playerRecord,
          });
        }

        const lifetimeCacheKey = `${shard}:${accountId}:lifetime`;
        let lifetimeAttributes = null;
        const cachedLifetime = lifetimeStatsCache.get(lifetimeCacheKey);
        if (cachedLifetime && Date.now() - cachedLifetime.timestamp < CACHE_DURATION) {
          lifetimeAttributes = cachedLifetime.data;
        } else {
          console.log(`[PUBG] Fetching fresh stats for ${playerName}`);
          const lifetimeUrl = `https://api.pubg.com/shards/${encodeSegment(shard)}/players/${encodeSegment(accountId)}/seasons/lifetime`;
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
            const seasonStatsUrl = `https://api.pubg.com/shards/${encodeSegment(shard)}/players/${encodeSegment(accountId)}/seasons/${encodeSegment(targetSeasonId)}`;
            const seasonStatsData = await doRequest(seasonStatsUrl);

            if (seasonStatsData && seasonStatsData.data && seasonStatsData.data.attributes) {
              seasonData = {
                id: targetSeasonId,
                attributes: seasonStatsData.data.attributes,
              };
            }

            try {
              const rankedSeasonStatsUrl =
                `https://api.pubg.com/shards/${encodeSegment(shard)}/players/${encodeSegment(accountId)}/seasons/${encodeSegment(targetSeasonId)}/ranked`;
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
        let resolvedAvatar = null;
        if (shard === "steam") {
          resolvedAvatar = await getBestEffortSteamAvatar(requestedPlayerId, displayPlayerName);
        }

        let profileExtras = null;
        try {
          profileExtras = await getMatchExtras({
            shard,
            accountId,
            playerName: displayPlayerName,
            playerRecord,
          });
        } catch (profileExtrasError) {
          console.log(`[PUBG] Profile extras unavailable for ${displayPlayerName}: ${profileExtrasError.message}`);
          profileExtras = createProfileExtrasError(profileExtrasError);
        }

        const mappedData = mapPubgStatsToFrontend(
          lifetimeAttributes,
          displayPlayerName,
          accountId,
          seasonData,
          rankedSeasonData,
          seasonCatalog,
          selectedSeasonId,
          shard,
          resolvedAvatar,
          profileExtras
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

  async function resolveAccountId(shard, requestedPlayerId) {
    const playerCacheKey = `${shard}:${requestedPlayerId}`;
    const cached = playerCache.get(playerCacheKey);
    if (cached) return cached;
    if (isStrictAccountId(requestedPlayerId)) return requestedPlayerId;

    const searchUrl =
      `https://api.pubg.com/shards/${encodeSegment(shard)}/players?` +
      `filter[playerNames]=${encodeSegment(requestedPlayerId)}`;
    const searchData = await doRequest(searchUrl);
    if (!searchData.data || searchData.data.length === 0) {
      throw new Error("Player not found");
    }
    const record = searchData.data[0];
    playerCache.set(playerCacheKey, record.id);
    setCachedPlayerName(shard, record.id, record.attributes.name);
    return record.id;
  }

  async function getPlayerExtras(platform, gameid) {
    const shard = resolveShard(platform);
    const requestedPlayerId = String(gameid || "").trim();
    if (!requestedPlayerId) throw new Error("Player not found");

    let accountId;
    if (isRateLimited()) {
      accountId = playerCache.get(`${shard}:${requestedPlayerId}`) ||
        (isStrictAccountId(requestedPlayerId) ? requestedPlayerId : null);
      if (!accountId) throw new Error("Rate Limit Reached");
    } else {
      accountId = await resolveAccountId(shard, requestedPlayerId);
    }

    const extrasKey = `${shard}:${accountId}`;
    const cached = extrasCache.get(extrasKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const maxAge = cached.data?.status === "ok" ? CACHE_DURATION : EXTRAS_RETRY_COOLDOWN_MS;
      if (age < maxAge) return cached.data;
    }

    if (isRateLimited()) {
      if (cached) return cached.data;
      throw new Error("Rate Limit Reached");
    }

    const inFlight = inFlightExtrasRequests.get(extrasKey);
    if (inFlight) return inFlight;

    const run = (async () => {
      try {
        const playerName = getCachedPlayerName(shard, accountId) || requestedPlayerId;
        const extras = await getMasteryExtras({ shard, accountId, playerName });
        extrasCache.set(extrasKey, { data: extras, timestamp: Date.now() });
        return extras;
      } finally {
        inFlightExtrasRequests.delete(extrasKey);
      }
    })();

    inFlightExtrasRequests.set(extrasKey, run);
    return run;
  }

  return { parsePlayerRank, getPlayerExtras };
}

module.exports = {
  createParsePlayerRank,
  shouldReenrich,
  createProfileExtrasError,
};
