import { isAccountIdentifier, resolvePreferredPlayerName } from "./playerIdentity";

export const shouldRecordHistory = ({ activeSeasonId, seasons } = {}) => {
  if (!activeSeasonId) return true;

  const list = Array.isArray(seasons) ? seasons : [];
  const currentSeason = list.find((season) => season && season.isCurrentSeason);

  if (!currentSeason || !currentSeason.id) return true;

  return currentSeason.id === activeSeasonId;
};

export const resolveHistoryCandidate = ({ data, routeGameId, routePlatform } = {}) => {
  const platformInfo = data?.platformInfo;
  if (!platformInfo) return null;

  const playerName = resolvePreferredPlayerName(platformInfo.platformUserHandle, routeGameId);
  if (!playerName || isAccountIdentifier(playerName)) return null;

  const activeSeasonId = data?.season?.id || data?.selectedSeasonId || null;
  if (!shouldRecordHistory({ activeSeasonId, seasons: data?.seasons })) return null;

  const rankedInfo = data?.season?.rankedInfo || null;
  return {
    platform: routePlatform || platformInfo.platformSlug || "steam",
    gameId: playerName,
    nickname: playerName,
    avatar: platformInfo.avatarUrl || null,
    rankIconUrl: rankedInfo?.iconUrl || rankedInfo?.iconFallbackUrl || null,
    rankLabel: rankedInfo?.label || null,
    rating: rankedInfo?.currentRankPoint ?? null,
  };
};
