function resolveShard(platform) {
  if (platform === "xbl" || platform === "xbox") return "xbox";
  if (platform === "psn") return "psn";
  return "steam";
}

module.exports = {
  resolveShard,
};
