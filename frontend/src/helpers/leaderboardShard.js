// PUBG's PC shard is shared across NA/EU/AS/SEA/SA; only KAKAO players live on their own shard.
const REGION_SHARDS = {
  "pc-na": "steam",
  "pc-eu": "steam",
  "pc-as": "steam",
  "pc-sea": "steam",
  "pc-sa": "steam",
  "pc-kakao": "kakao",
};

export const DEFAULT_LEADERBOARD_SHARD = "steam";

const warnedRegions = new Set();

export const shardForRegion = (region) => {
  const key = String(region || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(REGION_SHARDS, key)) return REGION_SHARDS[key];
  if (!warnedRegions.has(key)) {
    warnedRegions.add(key);
    console.warn(`shardForRegion: unrecognized region "${region}", defaulting to "${DEFAULT_LEADERBOARD_SHARD}"`);
  }
  return DEFAULT_LEADERBOARD_SHARD;
};
