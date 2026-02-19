const {
  aboutMe,
  bugReportPage,
  bugReportList,
  roadmapText,
  roadMapList,
  socialList,
} = require('../constant/articles')

module.exports.getAboutMe = async (req, res) => {
  try {
    const data = {
      aboutMe,
      socialList,
    }
    return res.status(200).json({ status: 200, data })
  } catch (e) {
    return res.status(200).json({ statu: 200, message: e.message })
  }
}

module.exports.getRoadmap = async (req, res) => {
  try {
    const data = {
      roadmapText,
      roadMapList,
    }
    return res.status(200).json({ status: 200, data })
  } catch (e) {
    return res.status(200).json({ statu: 200, message: e.message })
  }
}


module.exports.getBugReport = async (req, res) => {
  try {
    const data = {
      bugReportPage,
      bugReportList,
    }
    return res.status(200).json({ status: 200, data })
  } catch (e) {
    return res.status(200).json({ statu: 200, message: e.message })
  }
}