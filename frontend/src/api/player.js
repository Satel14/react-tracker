import { post } from './fetch'

export const getPlayerSteamName = (text) =>
  post(
    "/player/steamid",
    {
      text,
    },
    true
  );

export const getPlayerData = (platform, gameId) =>
  post(
    "/player/rank",
    {
      platform,
      gameId,
    },
    true
  );