import { API_TIMEOUT_MS, requestTimeoutError } from './apiBase'
import { adoptResponse, get, post } from './fetch'
import { rankPreloadKey, takeRankPreload } from './rankPreload'

const replayRequests = new Map();
const REPLAY_CACHE_TTL_MS = 5 * 60 * 1000;
const REPLAY_CACHE_LIMIT = 3;

const replayUrl = (matchId, shard, accountId, playerName) => {
  const params = new URLSearchParams();
  if (shard) params.set("shard", shard);
  if (accountId) params.set("accountId", accountId);
  if (playerName) params.set("playerName", playerName);
  const query = params.toString();
  return `/match/${encodeURIComponent(matchId)}/replay${query ? `?${query}` : ""}`;
};

const loadMatchReplay = (matchId, shard, accountId, playerName, notificationErr) => {
  const url = replayUrl(matchId, shard, accountId, playerName);
  const now = Date.now();
  const cached = replayRequests.get(url);

  if (cached && cached.expiresAt > now) {
    replayRequests.delete(url);
    replayRequests.set(url, cached);
    return cached.promise;
  }

  if (cached) replayRequests.delete(url);

  const entry = {
    expiresAt: now + REPLAY_CACHE_TTL_MS,
    promise: null,
  };
  entry.promise = get(url, notificationErr).catch((error) => {
    if (replayRequests.get(url) === entry) replayRequests.delete(url);
    throw error;
  });
  replayRequests.set(url, entry);

  while (replayRequests.size > REPLAY_CACHE_LIMIT) {
    const oldest = replayRequests.keys().next().value;
    replayRequests.delete(oldest);
  }

  return entry.promise;
};

export const getPlayerSteamName = (text) =>
  post(
    "/player/steamid",
    {
      text,
    },
    true
  );

export const getPlayerData = async (platform, gameId, seasonId = null) => {
  // Only the page's first lookup can match: the inline script asks for the
  // current season, and by the time anything requests a past one the preload is
  // long consumed.
  const preloaded = seasonId ? null : takeRankPreload(rankPreloadKey(platform, gameId));

  const body = { platform, gameId, seasonId };

  if (preloaded) {
    const result = await preloaded;

    if (!result?.preloadFailed && result) {
      return adoptResponse(result, true);
    }

    if (result?.preloadFailed) {
      // The lookup was bounded once, in total, before the preload existed, and
      // it stays bounded once: a preload that ran out of time reports that, and
      // one that died earlier hands the replacement only what is left. Starting
      // a fresh wait on top of a spent one made the visitor sit through both.
      const remainingMs = result.timedOut
        ? 0
        : API_TIMEOUT_MS - Math.max(0, Date.now() - (result.startedAt ?? Date.now()));

      if (remainingMs <= 0) throw requestTimeoutError();

      return post("/player/rank", body, true, { timeoutMs: remainingMs });
    }
    // Anything unrecognisable: fall through to an ordinary request.
  }

  return post("/player/rank", body, true);
};

export const getPlayerReports = (accountId, playerName) =>
  post(
    "/player/reports",
    {
      accountId,
      playerName,
    },
    true
  );

export const getPlayerExtras = (platform, gameId) =>
  post("/player/extras", { platform, gameId }, false);

export const resolvePlayers = (platform, gameIds) =>
  post("/player/resolve", { platform, gameIds }, false);

export const getLiveSnapshot = () =>
  get("/player/live", true);

export const getRecentSearches = () =>
  get("/player/recent", true);

export const getAggregateHeatmap = ({ shard, accountId, playerName, map, matchIds }) =>
  post(
    "/player/heatmap/aggregate",
    { shard, accountId, playerName, map, matchIds },
    true
  );

export const getMatchReplay = (matchId, shard, accountId, playerName) => {
  return loadMatchReplay(matchId, shard, accountId, playerName, true);
};

export const prefetchMatchReplay = (matchId, shard, accountId, playerName) =>
  loadMatchReplay(matchId, shard, accountId, playerName, false);

export const getMatchAnalysis = (matchId, shard, accountId, playerName) => {
  const params = new URLSearchParams();
  if (shard) params.set("shard", shard);
  if (accountId) params.set("accountId", accountId);
  if (playerName) params.set("playerName", playerName);
  const query = params.toString();
  return get(`/match/${encodeURIComponent(matchId)}/analysis${query ? `?${query}` : ""}`, true);
};
