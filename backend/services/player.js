const MESSAGE = require("../constant/responeMessages");

module.exports.getPlayerRank = async () => {
  try {
    return [];
  } catch (e) {
    throw Error(e.message);
  }
};

module.exports.addLastSearchers = async (data) => {
  try {
    const fs = require("fs")
    const fileName = '../json/last-searcheds.json';
    const file = require(fileName)

    if (file[data.gameid]) {
      delete file[data.gameid]
    }

    file[data.gameid] = data;

    const length = Object.keys(file.length)

    if (length > 5) {
      delete file[Object.keys(file)[0]]
    }

    const path = require("path")
    const finalPath = path.join("../backend/src/json", "last-searcheds.json")
    fs.writeFileSync(finalPath, JSON.stringify(file), function writeJSON(err) {
      if (err) return console.log(err)
    })
    return data
  } catch (e) {
    throw Error(e.message)
  }
}