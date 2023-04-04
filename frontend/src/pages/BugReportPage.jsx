import React from 'react'

import { getBugReport } from './../api/all/articles'

const renderList = (list) => {
  let arr = [];
  for (let key in list) {
    let element = list[key]

    let isUrl = false;
    if (element.url) {
      isUrl = true;
    }
    arr.push(
      <div key={element.name}>
        <span>{element.name}</span>
        {isUrl ? (
          <a href={element.url}>{element.text}</a>
        ) : (
          <span>{element.text}</span>
        )}
      </div>
    )
  }
  return arr
}

class BugReportPage extends React.Component {
  state = {
    bugReportText: '',
    bugReportList: [],
  }

  async componentDidMount() {
    const result = await getBugReport().then(({ data }) => {
      return data;
    })
    this.setState({
      bugReportText: result.bugReportText,
      bugReportList: result.bugReportList,
    })
  }

  render() {
    const { bugReportList, bugReportText } = this.state
    return (
      <div className='content'>
        <div className='bugreport'>
          <h1>Bug Report</h1>
          <div className='aboutmepage-text'>{bugReportText}</div>
          <div className='aboutmepage-socials'>{renderList(bugReportList)}</div>
        </div>
      </div>
    )
  }
}

export default BugReportPage