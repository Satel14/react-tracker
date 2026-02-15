function getSafeInitials(name) {
  if (typeof name !== "string" || !name.trim()) return "PU";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function buildFallbackAvatarDataUri(name) {
  const initials = getSafeInitials(name);
  const safeInitials = initials.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "PU";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">` +
    `<stop offset="0%" stop-color="#172236"/><stop offset="100%" stop-color="#0c141f"/>` +
    `</linearGradient></defs><rect width="256" height="256" rx="32" fill="url(#g)"/>` +
    `<circle cx="128" cy="128" r="94" fill="none" stroke="#78f7a8" stroke-opacity="0.35" stroke-width="4"/>` +
    `<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="86" font-weight="700" fill="#ffffff">${safeInitials}</text>` +
    `</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

module.exports = {
  buildFallbackAvatarDataUri,
};
