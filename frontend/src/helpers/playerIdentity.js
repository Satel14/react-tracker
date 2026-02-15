export const normalizePlatform = (platform) => {
  const normalized = String(platform || "steam").trim().toLowerCase();
  if (normalized === "xbl") return "xbox";
  return normalized || "steam";
};

export const isAccountIdentifier = (value) =>
  typeof value === "string" && /^account\./i.test(value.trim());

export const stripPlatformPrefix = (value, platform) => {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const prefix = `${normalizePlatform(platform)}:`;
  if (raw.toLowerCase().startsWith(prefix)) {
    return raw.slice(prefix.length);
  }

  return raw;
};

export const normalizeDisplayName = (nickname, gameId, platform) => {
  const normalizedGameId = stripPlatformPrefix(String(gameId || "").trim(), platform);
  const normalizedNickname = stripPlatformPrefix(String(nickname || "").trim(), platform);

  if (normalizedNickname && !(isAccountIdentifier(normalizedNickname) && !isAccountIdentifier(normalizedGameId))) {
    return normalizedNickname;
  }

  return normalizedGameId || "Unknown";
};

export const resolvePreferredPlayerName = (apiHandle, routeHandle) => {
  const requested = typeof routeHandle === "string" ? routeHandle.trim() : "";
  const resolved = typeof apiHandle === "string" ? apiHandle.trim() : "";

  if (resolved && (!isAccountIdentifier(resolved) || isAccountIdentifier(requested))) {
    return resolved;
  }

  if (requested) {
    return requested;
  }

  return resolved || "";
};
