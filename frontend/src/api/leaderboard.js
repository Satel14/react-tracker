import { get } from "./fetch";

export const getLeaderboard = (platform, gameMode, season = null) => {
  const query = season ? `?season=${encodeURIComponent(season)}` : "";
  return get(`/leaderboard/${platform}/${gameMode}${query}`, true);
};

export const getSeasons = (platform) => get(`/seasons/${platform}`, true);
