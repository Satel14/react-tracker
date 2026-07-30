const { bugReportText, bugReportList } = require('../constant/articles')

module.exports.getBugReport = async (req, res) => {
  try {
    const data = {
      bugReportText,
      bugReportList,
    }
    return res.status(200).json({ status: 200, data })
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message })
  }
}