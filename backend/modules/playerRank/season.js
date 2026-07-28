function parseSeasonNumber(seasonId) {
  if (typeof seasonId !== "string") return null;
  const match = seasonId.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function toSeasonLabel(seasonId) {
  const number = parseSeasonNumber(seasonId);
  if (Number.isFinite(number)) return `Season #${number}`;

  if (typeof seasonId === "string" && seasonId.trim()) {
    const trimmed = seasonId.trim();
    const segments = trimmed.split(".").filter(Boolean);
    const trailingSegment = segments[segments.length - 1] || trimmed;
    return `Season ${trailingSegment}`;
  }

  return "Unknown Season";
}

function normalizeSeasonId(seasonId) {
  if (typeof seasonId !== "string") return null;
  const normalized = seasonId.trim();
  return normalized ? normalized : null;
}

module.exports = {
  normalizeSeasonId,
  parseSeasonNumber,
  toSeasonLabel,
};
