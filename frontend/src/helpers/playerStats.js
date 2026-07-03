export const statNumber = (stats, key) => {
  const parsed = Number(stats?.[key]?.value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const statDisplay = (stats, key, fallback = "-") =>
  stats?.[key]?.displayValue || fallback;
