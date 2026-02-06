import React, { Component } from 'react';
import themes from './config/themes'
import { Dropdown } from 'antd'
import { FormatPainterOutlined } from "@ant-design/icons";
class SetTheme extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentTheme: 'brown'
    }
  }
  async componentDidMount() {
    const localTheme = await localStorage.getItem('theme');

    if (localTheme && themes[localTheme]) {
      this.setState({
        currentTheme: localTheme,
      })

      window.App.changeTheme(localTheme)
    }
  }

  handleSetTheme = (key) => () => {
    this.setState({
      currentTheme: key,
    })
    localStorage.setItem('theme', key)
    window.App.changeTheme(key)
  }
  render() {
    const items = Object.keys(themes).map((key) => ({
      key,
      label: <div style={{ background: themes[key], height: 24, width: '100px' }}></div>,
      className: this.state.currentTheme === key ? "dropdown-theme-active" : "",
      onClick: this.handleSetTheme(key),
    }));

    return (
      <Dropdown
        menu={{ items }}
        className="dropdown-theme"
        trigger={["click"]}
      >
        <span>
          <FormatPainterOutlined
            style={{ color: themes[this.state.currentTheme] }}
          />
        </span>
      </Dropdown>
    );
  }
}

export default SetTheme;
