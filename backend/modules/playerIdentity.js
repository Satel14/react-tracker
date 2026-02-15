function normalizePlatform(platform) {
  const value = String(platform || "steam").trim().toLowerCase();
  if (value === "xbl") return "xbox";
  return value || "steam";
}

function isAccountIdentifier(value) {
  return typeof value === "string" && /^account\./i.test(value.trim());
}

function stripPlatformPrefix(value, platform) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const prefix = `${normalizePlatform(platform)}:`;
  if (raw.toLowerCase().startsWith(prefix)) {
    return raw.slice(prefix.length);
  }

  return raw;
}

module.exports = {
  isAccountIdentifier,
  normalizePlatform,
  stripPlatformPrefix,
};
