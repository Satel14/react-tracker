import React, { Component } from 'react';
import themes from './config/themes'
import { Menu, Dropdown } from 'antd'
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

    let renderThemes = []

    for (let key in themes) {
      renderThemes.push(
        <Menu.Item
          key={key}
          className={this.state.currentTheme === key && 'dropdown-theme-active'}
          onClick={this.handleSetTheme(key)}
          style={{ background: themes[key], height: 24 }}
        ></Menu.Item>
      )
    }
    return (
      <Dropdown
        overlay={<Menu>{renderThemes}</Menu>}
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
