const ALLOWED_SHARDS = Object.freeze([
  "steam",
  "kakao",
  "xbox",
  "xbl",
  "psn",
  "stadia",
  "console",
]);

const ACCOUNT_ID_PATTERN = /^account\.[0-9a-f]{32}$/i;
const MAX_GAME_ID_LENGTH = 64;

function normalizeShard(shard) {
  return typeof shard === "string" ? shard.trim().toLowerCase() : "";
}

function isAllowedShard(shard) {
  return ALLOWED_SHARDS.includes(normalizeShard(shard));
}

function assertShard(shard) {
  const normalized = normalizeShard(shard);
  if (!ALLOWED_SHARDS.includes(normalized)) {
    throw new Error("Invalid shard");
  }
  return normalized;
}

function isStrictAccountId(value) {
  return typeof value === "string" && ACCOUNT_ID_PATTERN.test(value.trim());
}

function isValidGameId(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_GAME_ID_LENGTH;
}

function encodeSegment(value) {
  return encodeURIComponent(String(value == null ? "" : value));
}

module.exports = {
  ALLOWED_SHARDS,
  ACCOUNT_ID_PATTERN,
  MAX_GAME_ID_LENGTH,
  isAllowedShard,
  assertShard,
  isStrictAccountId,
  isValidGameId,
  encodeSegment,
};
