import { Menu } from "@material-ui/core";
import React from "react";
import { DownOutlined } from "@ant-design/icons";


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
          <Menu.Item key="home">Home</Menu.Item>
          <Menu.Item key="leader">Leaderboards</Menu.Item>
          <Menu.Item key="help">Help</Menu.Item>
        </Menu>

        <div className="navbar_logo">
          <span>RL</span>
          <span>TV</span>
        </div>
        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal"
        >
          <Menu.Item key="favorites">Favorites</Menu.Item>
          <Menu.Item key="distribution">Distribution</Menu.Item>
          <Menu.Item key="overlay">OBS overlay</Menu.Item>
        </Menu>
      </div>
    );
  }
}

export default Navbar;
