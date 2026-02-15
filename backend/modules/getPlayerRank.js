const { createParsePlayerRank } = require("./playerRank/parsePlayerRank");

const PUBG_API_KEY = process.env.PUBG_API_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY || process.env.STEAM_WEB_API_KEY || "";

const parsePlayerRank = createParsePlayerRank({
  pubgApiKey: PUBG_API_KEY,
  steamApiKey: STEAM_API_KEY,
});

module.exports = {
  parsePlayerRank,
};
