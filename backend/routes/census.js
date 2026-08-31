const CensusController = require("../controllers/census");

module.exports = (router) => {
  // Guarded by CENSUS_TOKEN inside the controller: it spends PUBG quota shared
  // with the live site, and an unset token shuts the route rather than opening
  // it. Answers 404 to an unauthorised caller so its existence is not leaked.
  router.post("/api/census/run", CensusController.runCensus);

  // How the scheduled job learns the outcome: the run outlives the request that
  // starts it, so the result cannot come back in that response. Guarded by the
  // same token, and the polling is also what keeps a free instance awake while
  // it works.
  router.get("/api/census/status", CensusController.getStatus);

  // Public: this is the published result and costs no PUBG quota.
  router.get("/api/census/distribution", CensusController.getDistribution);
};
