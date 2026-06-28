import { get, post } from './fetch'

export const getPlayerSteamName = (text) =>
  post(
    "/player/steamid",
    {
      text,
    },
    true
  );

export const getPlayerData = (platform, gameId, seasonId = null) =>
  post(
    "/player/rank",
    {
      platform,
      gameId,
      seasonId,
    },
    true
  );

export const getPlayerReports = (accountId, playerName) =>
  post(
    "/player/reports",
    {
      accountId,
      playerName,
    },
    true
  );

export const getLiveSnapshot = () =>
  get("/player/live", true);

export const getRecentSearches = () =>
  get("/player/recent", true);

export const getMatchHeatmap = (matchId, shard, accountId, playerName) => {
  const params = new URLSearchParams();
  if (shard) params.set("shard", shard);
  if (accountId) params.set("accountId", accountId);
  if (playerName) params.set("playerName", playerName);
  const query = params.toString();
  return get(`/match/${encodeURIComponent(matchId)}/heatmap${query ? `?${query}` : ""}`, true);
};

export const getAggregateHeatmap = ({ shard, accountId, playerName, map, matchIds }) =>
  post(
    "/player/heatmap/aggregate",
    { shard, accountId, playerName, map, matchIds },
    true
  );

export const getMatchReplay = (matchId, shard, accountId, playerName) => {
  const params = new URLSearchParams();
  if (shard) params.set("shard", shard);
  if (accountId) params.set("accountId", accountId);
  if (playerName) params.set("playerName", playerName);
  const query = params.toString();
  return get(`/match/${encodeURIComponent(matchId)}/replay${query ? `?${query}` : ""}`, true);
};
