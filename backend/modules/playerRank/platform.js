function resolveShard(platform) {
  const normalized = String(platform || "steam").trim().toLowerCase();
  if (normalized === "xbl") return "xbox";
  if (normalized === "steam") return "steam";
  if (normalized === "kakao") return "kakao";
  if (normalized === "xbox") return "xbox";
  if (normalized === "psn") return "psn";
  if (normalized === "stadia") return "stadia";
  return "steam";
}

module.exports = {
  resolveShard,
};
