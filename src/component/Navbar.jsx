import { Menu } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import React from "react";

const { SubMenu } = Menu;

class Navbar extends React.Component {
  state = {
    current: "mail",
  };

  handleClick = (e) => {
    console.log("click ", e);
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
          <Menu.Item key="leaderboard">Leaderboard</Menu.Item>
          <Menu.Item key="about">About</Menu.Item>
          <Menu.Item key="help"> Help</Menu.Item>
          <Menu.Item key="satel" icon={<SettingOutlined />}>
            Satel
          </Menu.Item>
        </Menu>
      </div>
    );
  }
}

export default Navbar;
