import { post } from './fetch'

export const getPlayerSteamName = (text) =>
  post(
    "/player/steamid",
    {
      text,
    },
    true
  );