const { getPlayerProfile } = require("./getPlayerRank");
const { isRateLimited } = require("./playerRank/state");
const { createPcLauncherCheck } = require("./playerRank/pcLauncher");

const checkPcLauncher = createPcLauncherCheck({ getPlayerProfile, isRateLimited });

module.exports = { checkPcLauncher };
