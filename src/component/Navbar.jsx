import React from "react";
import { Menu } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { SetLanguage } from "react-switch-lang";
import PropTypes from 'prop-types';
import CookieRule from "./CookieRule";

const { SubMenu } = Menu;

const langmenu = (
  <Menu>
    <Menu.Item key="1">EN</Menu.Item>
    <Menu.Item key="2">RU</Menu.Item>
  </Menu>
);

class Navbar extends React.Component {
  state = {
    current: "home",
  };

  handleClick = (e) => {
    this.setState({ current: e.key });
  };


  render() {
    const { current } = this.state;
    const { t } = this.props;
    return (
      <div className="navbar">
        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal"
        >
          <Menu.Item key="main" icon={<HomeOutlined />}>
            <Link to="/">{t("menu.main")}</Link>
            Home
          </Menu.Item>
          <Menu.Item key="leaderboard">Leaderboard</Menu.Item>
          <Menu.Item key="about">About</Menu.Item>
        </Menu>
        <div className="navbar__logo">
          <span>CS</span>
          <span>TV</span>
        </div>
        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal" 
          className="right-menu"
        >
          <Menu.Item key="favorites"> Favorites</Menu.Item>
          <Menu.Item key="distribution"> Distribution</Menu.Item>
          <Menu.Item key="overlay"> OBS overlay</Menu.Item>
        </Menu>
        <div className="navbar_lang">
          <SetLanguage />
        </div>
      </div>
    );
  }
}

Navbar.propTypes = {
  t: PropTypes.func.isRequired,
};


export default Navbar;
