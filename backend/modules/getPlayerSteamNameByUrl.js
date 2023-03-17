const parser = require("fast-xml-parser")

function doRequest(url) {
  return new Promise(function (resolve, reject) {
    const request = require("request");
    request(url, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}

module.exports.getPlayerSteamNameByUrl = async (url) => {
  try {
    const body = await doRequest(url + "/?xml=1");
    const jsonObj = parser.parse(body)
    return jsonObj.profile.customURL || jsonObj.parser.steamID64;
  } catch (e) {
    throw Error(e.message);
  }
}