import React from "react";
import PropTypes from "prop-types";
import { Menu, Badge } from "antd";
import { translate } from "react-switch-lang";
import {
  HomeOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import SetLanguage from "../Language/SetLanguage";
import { withRouter } from "react-router";

const componentRoutes = ["/", "/leaderboards", "/favorites", "/help"];

class Navbar extends React.Component {
  state = {
    current: "home",
  };
  handleClick = (e) => {
    this.setState({ current: e.key });
  };

  handleClickMenu = (e) => {
    console.log(e.key);
    this.props.history.push(e);
  };


  componentDidMount() {
    const url = window.location.pathname;
    console.log(url);
    if (componentRoutes.includes(url)) {
      this.setState({
        current: url === "/" ? "main" : url.replace("/", ""),
      });
    }
  }
  componentDidUpdate(prevProps) {
    if (this.props.location !== prevProps.location) {
      this.onRoutesChanges();
    }
  }

  onRoutesChanges() {
    const url = this.props.location?.pathname;
    if (url) {
      if (!componentRoutes.includes(url)) {
        this.setState({
          current: "",
        });
      }
    }
  }

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
          <Menu.Item
            key="main"
            icon={<HomeOutlined />}
            onClick={() => this.handleClickMenu("/home")}
          >
            <Link to="/home">{t("menu.main")}</Link>
          </Menu.Item>

          <Menu.Item
            key="favorites"
            icon={<ProjectOutlined />}
            onClick={() => this.handleClickMenu("/favorites")}
          >
            <Badge count={10}>
              <Link to="/favorites">{t("menu.favorites")}</Link>
            </Badge>
          </Menu.Item>

          <Menu.Item
            key="help"
            icon={<QuestionCircleOutlined />}
            onClick={() => this.handleClickMenu("/help")}
          >
            <Link to="/help">{t("menu.help")}</Link>
          </Menu.Item>
        </Menu>

        <div className="navbar__logo">
          <span>CSGO</span>
          <span>.TV</span>
        </div>

        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal"
          className="right-menu"
        ></Menu>

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

export default withRouter(translate(Navbar));
