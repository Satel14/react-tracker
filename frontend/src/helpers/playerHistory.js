export const shouldRecordHistory = ({ activeSeasonId, seasons } = {}) => {
  if (!activeSeasonId) return true;

  const list = Array.isArray(seasons) ? seasons : [];
  const currentSeason = list.find((season) => season && season.isCurrentSeason);

  if (!currentSeason || !currentSeason.id) return true;

  return currentSeason.id === activeSeasonId;
};
