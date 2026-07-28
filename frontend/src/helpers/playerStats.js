export const statNumber = (stats, key) => {
  const raw = stats?.[key]?.value;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const statDisplay = (stats, key, fallback = "-") =>
  stats?.[key]?.displayValue || fallback;
