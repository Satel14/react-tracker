// The one season-catalog instance in the process.
//
// It used to be built inside getLeaderboard.js, which is where it was first
// needed. The census needs the same answer -- which season is current -- and
// two instances would each hold their own in-flight map, so a cold cache could
// send two /seasons requests for one question.

const { createPubgApiClient } = require("./playerRank/pubgApi");
const { createSeasonCatalogService } = require("./playerRank/seasonCatalog");
const {
  seasonCatalogCache,
  CURRENT_SEASON_CACHE_DURATION,
  setRateLimited,
  inFlightSeasonCatalogRequests,
} = require("./playerRank/state");

const { doRequest } = createPubgApiClient({
  apiKey: process.env.PUBG_API_KEY,
  onRateLimit: setRateLimited,
});

const { getSeasonCatalog } = createSeasonCatalogService({
  seasonCatalogCache,
  currentSeasonCacheDuration: CURRENT_SEASON_CACHE_DURATION,
  doRequest,
  inFlightSeasonCatalogRequests,
});

const getCurrentSeasonId = async (shard) => (await getSeasonCatalog(shard))?.currentSeasonId ?? null;

module.exports = { getSeasonCatalog, getCurrentSeasonId };
