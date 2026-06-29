// Official PUBG leaderboards are only published for PC regional shards
// (NOT the steam/xbox/psn account shards used by the player-stats pipeline).
const LEADERBOARD_REGIONS = ["pc-na", "pc-eu", "pc-as", "pc-sea", "pc-sa", "pc-kakao"];

const DEFAULT_REGION = "pc-na";

// Seasons are shared across PC regions; query the season catalog with a
// plain account shard that the /seasons endpoint accepts.
const SEASON_SHARD = "steam";

function resolveRegion(region) {
  const normalized = String(region || "").trim().toLowerCase();
  return LEADERBOARD_REGIONS.includes(normalized) ? normalized : DEFAULT_REGION;
}

module.exports = {
  LEADERBOARD_REGIONS,
  DEFAULT_REGION,
  SEASON_SHARD,
  resolveRegion,
};
