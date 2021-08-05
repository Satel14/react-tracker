import { Menu } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import React from "react";
import { Link } from "react-router-dom";

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
    return (
      <div className="navbar">
        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal"
        >
          <Menu.Item as={Link} to='/playerpage' key="home">Home</Menu.Item>
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
        >
          <Menu.Item key="favorites"> Favorites</Menu.Item>
          <Menu.Item key="distribution"> Distribution</Menu.Item>
          <Menu.Item key="overlay"> OBS overlay</Menu.Item>
        </Menu>
      </div>
    );
  }
}

export default Navbar;
