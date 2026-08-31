const CensusController = require("../controllers/census");

module.exports = (router) => {
  // Guarded by CENSUS_TOKEN inside the controller: it spends PUBG quota shared
  // with the live site, and an unset token shuts the route rather than opening
  // it. Answers 404 to an unauthorised caller so its existence is not leaked.
  router.post("/api/census/run", CensusController.runCensus);

  // Public: this is the published result and costs no PUBG quota.
  router.get("/api/census/distribution", CensusController.getDistribution);
};
