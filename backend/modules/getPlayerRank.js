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

module.exports.parsePlayerRank = async (platform, gameid) => {
  try {
    const url = process.env.API_PLAYER_RANK + platform + "/" + gameid;
    let body = await doRequest(url)
    const json = JSON.parse(body)
    return json;
  } catch (e) {
    throw Error(e.message)
  }
};