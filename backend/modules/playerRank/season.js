function parseSeasonNumber(seasonId) {
  if (typeof seasonId !== "string") return null;
  const match = seasonId.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function toSeasonLabel(seasonId) {
  const number = parseSeasonNumber(seasonId);
  return Number.isFinite(number) ? `Season #${number}` : "Current Season";
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
