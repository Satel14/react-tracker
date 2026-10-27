// "Since you last looked": the difference between two readings of one
// profile's running season totals, taken by this browser on two visits.
// Totals only grow within a season, so the difference is exact -- nothing is
// estimated, and nothing leaves the browser.
import { normalizePlatform } from "./playerIdentity.js";

const ACCOUNT_ID = /^account\.[0-9a-f]{32}$/i;

const total = (stat) => {
  const value = stat?.value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
};

export const snapshotOf = (data) => {
  const season = data?.season;
  const accountId = data?.platformInfo?.platformUserId;
  const platform = data?.platformInfo?.platformSlug;
  // A past season does not move, so there is nothing to compare.
  if (!season?.isCurrentSeason || !season.id || !platform || !ACCOUNT_ID.test(String(accountId || ""))) return null;

  const matches = total(season.stats?.matchesPlayed);
  const wins = total(season.stats?.wins);
  const kills = total(season.stats?.kills);
  if (matches === null || wins === null || kills === null) return null;

  const rankPoint = season.rankedInfo?.currentRankPoint;
  return {
    key: `${normalizePlatform(platform)}:${accountId}`,
    seasonId: season.id,
    rankPoint: typeof rankPoint === "number" && Number.isFinite(rankPoint) ? rankPoint : null,
    tier: season.rankedInfo?.label || null,
    matches,
    wins,
    kills,
  };
};

export const changeSince = (previous, current) => {
  if (!previous || !current || previous.seasonId !== current.seasonId) return null;
  if (typeof previous.at !== "number") return null;

  const matches = current.matches - previous.matches;
  const wins = current.wins - previous.wins;
  const kills = current.kills - previous.kills;
  // A total that went backwards means the two readings are not comparable.
  if ([matches, wins, kills].some((delta) => !Number.isFinite(delta) || delta < 0)) return null;

  const rankPoint = typeof previous.rankPoint === "number" && typeof current.rankPoint === "number"
    ? current.rankPoint - previous.rankPoint
    : null;
  if (matches === 0 && !rankPoint) return null;

  const tier = previous.tier && current.tier && previous.tier !== current.tier ? current.tier : null;
  return { since: previous.at, matches, wins, kills, rankPoint, tier };
};

export const timeAgo = (elapsed, language = "en") => {
  const format = new Intl.RelativeTimeFormat(language === "ua" ? "uk" : "en", { numeric: "auto" });
  const minutes = Math.max(1, Math.round(elapsed / 60000));
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.round(hours / 24), "day");
};
