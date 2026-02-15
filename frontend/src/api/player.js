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
