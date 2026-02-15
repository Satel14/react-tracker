const { parseSeasonNumber, toSeasonLabel } = require("./season");

function createSeasonCatalogService({
  seasonCatalogCache,
  currentSeasonCacheDuration,
  doRequest,
}) {
  async function getSeasonCatalog(shard) {
    const cached = seasonCatalogCache.get(shard);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const seasonsUrl = `https://api.pubg.com/shards/${shard}/seasons`;
    const seasonsData = await doRequest(seasonsUrl);

    const mappedSeasons = (seasonsData.data || [])
      .filter((season) => !(season.attributes && season.attributes.isOffseason))
      .map((season) => {
        const seasonNumber = parseSeasonNumber(season.id);
        return {
          id: season.id,
          label: toSeasonLabel(season.id),
          seasonNumber,
          isCurrentSeason: Boolean(season.attributes && season.attributes.isCurrentSeason),
        };
      });

    const dedupBySeason = new Map();
    mappedSeasons.forEach((season) => {
      const key = Number.isFinite(season.seasonNumber) ? `num:${season.seasonNumber}` : `id:${season.id}`;
      const existing = dedupBySeason.get(key);

      if (!existing) {
        dedupBySeason.set(key, season);
        return;
      }

      if (season.isCurrentSeason && !existing.isCurrentSeason) {
        dedupBySeason.set(key, season);
        return;
      }

      const seasonLooksCanonical = /-\d+$/.test(season.id);
      const existingLooksCanonical = /-\d+$/.test(existing.id);
      if (seasonLooksCanonical && !existingLooksCanonical) {
        dedupBySeason.set(key, season);
      }
    });

    const seasons = Array.from(dedupBySeason.values()).sort((a, b) => {
      if (Number.isFinite(a.seasonNumber) && Number.isFinite(b.seasonNumber)) {
        return b.seasonNumber - a.seasonNumber;
      }
      if (Number.isFinite(a.seasonNumber)) return -1;
      if (Number.isFinite(b.seasonNumber)) return 1;
      return String(b.id).localeCompare(String(a.id));
    });

    const currentSeason = seasons.find((season) => season.isCurrentSeason) || seasons[0] || null;
    const data = {
      seasons,
      currentSeasonId: currentSeason ? currentSeason.id : null,
    };

    seasonCatalogCache.set(shard, {
      data,
      expiresAt: Date.now() + currentSeasonCacheDuration,
    });

    return data;
  }

  return {
    getSeasonCatalog,
  };
}

module.exports = {
  createSeasonCatalogService,
};
