const { XMLParser } = require("fast-xml-parser");

function isAllowedSteamUrl(text) {
  if (typeof text !== "string" || !text.trim()) {
    return false;
  }
  let url;
  try {
    url = new URL(text.trim());
  } catch (_e) {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return host === "steamcommunity.com" || host.endsWith(".steamcommunity.com");
}

async function doRequest(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam profile request failed: ${response.status}`);
  }
  return response.text();
}

module.exports.isAllowedSteamUrl = isAllowedSteamUrl;

module.exports.getPlayerSteamNameByUrl = async (url) => {
  try {
    if (!isAllowedSteamUrl(url)) {
      return null;
    }
    // Built through URL rather than by string append: the slash used to go on
    // the end of the whole string, query and all, and "?xml=1" after that -- so
    // a URL pasted straight out of the browser asked Steam for a parameter
    // called l with the value "english/?xml=1" and got HTML back.
    const target = new URL(url.trim());
    if (!target.pathname.endsWith("/")) target.pathname += "/";
    target.hash = "";
    target.searchParams.set("xml", "1");
    const body = await doRequest(target.toString());
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
