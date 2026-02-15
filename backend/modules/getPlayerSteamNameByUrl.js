const { XMLParser } = require("fast-xml-parser");

async function doRequest(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam profile request failed: ${response.status}`);
  }
  return response.text();
}

module.exports.getPlayerSteamNameByUrl = async (url) => {
  try {
    const normalized = url.endsWith("/") ? url : `${url}/`;
    const body = await doRequest(`${normalized}?xml=1`);
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
    });
    const jsonObj = parser.parse(body) || {};
    const profile = jsonObj.profile || {};

    return profile.customURL || profile.steamID64 || null;
  } catch (e) {
    throw Error(e.message);
  }
};
