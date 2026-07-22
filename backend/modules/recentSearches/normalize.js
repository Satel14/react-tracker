const {
  isAccountIdentifier,
  normalizePlatform,
  stripPlatformPrefix,
} = require("../playerIdentity");

const MAX_RECENT_SEARCHES = 20;

function normalizeRecentEntry(entry = {}) {
  const platform = normalizePlatform(entry.platform);
  const gameId = stripPlatformPrefix(String(entry.gameId || entry.id || "").trim(), platform);
  if (!gameId) return null;

  const rawNickname = stripPlatformPrefix(String(entry.nickname || "").trim(), platform);
  const nickname =
    rawNickname && !(isAccountIdentifier(rawNickname) && !isAccountIdentifier(gameId))
      ? rawNickname
      : gameId;
  const avatar = typeof entry.avatar === "string" && entry.avatar.trim() ? entry.avatar.trim() : null;
  const rankIconUrl =
    typeof entry.rankIconUrl === "string" && entry.rankIconUrl.trim() ? entry.rankIconUrl.trim() : null;
  const rankLabel =
    typeof entry.rankLabel === "string" && entry.rankLabel.trim() ? entry.rankLabel.trim() : null;
  const rating =
    entry.rating === null || entry.rating === undefined || entry.rating === ""
      ? null
      : Number(entry.rating);
  const searchedAt =
    Number.isFinite(Number(entry.searchedAt)) && Number(entry.searchedAt) > 0
      ? Number(entry.searchedAt)
      : 0;

  return {
    id: `${platform}:${gameId}`,
    gameId,
    platform,
    nickname,
    avatar,
    rankIconUrl,
    rankLabel,
    rating: Number.isFinite(rating) ? rating : null,
    searchedAt,
  };
}

module.exports = { MAX_RECENT_SEARCHES, normalizeRecentEntry };
