const {
  aboutMe,
  bugReportPage,
  bugReportList,
  roadmapText,
  roadMapList,
  socialList,
} = require('../constant/articles')

module.exports.getAboutMe = async (res, req) => {
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

module.exports.getRoadmap = async (res, req) => {
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


module.exports.getBugReport = async (res, req) => {
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