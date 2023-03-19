import React, { Component } from 'react';
import { getHistory } from './../cookie/store';
import { Fade } from 'react-reveal/Fade';
import { translate } from "react-switch-lang";

class HistoryChecking extends Component {
  constructor(props) {
    super(props)
    this.state = {
      historyList: null,
    }
  }

  async componentDidMount() {
    const items = await getHistory()

    if (items !== null && Object.keys(items).length > 0) {
      this.setState({
        historyList: items,
      })
    }
  }

  render() {

    const { t } = this.props

    return (
      <Fade delay={300}>
        <div className='titlehistory'>{t("page.main.searchingHistory")}</div>
        <div className='historycheck'></div>
      </Fade>
    );
  }
}

export default translate(HistoryChecking);
