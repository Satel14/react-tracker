import React from "react";
import PropTypes from "prop-types";
import { Menu, Badge } from "antd";
import { translate } from "react-switch-lang";
import {
  HomeOutlined,
  HeartOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import SetLanguage from "../Language/SetLanguage";
import { withRouter } from "react-router";
import SetTheme from './SetTheme';

const componentRoutes = ["/", "/leaderboards", "/favorites", "/help"];

class Navbar extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      current: "home",
    };

    window.Navbar = this;
  }
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

    const items = [
      {
        key: "main",
        icon: <HomeOutlined />,
        label: <Link to="/">{t("menu.main")}</Link>,
        onClick: () => this.handleClickMenu("/"),
      },
      {
        key: "favorites",
        icon: <HeartOutlined />,
        label: (
          <Badge count={10}>
            <Link to="/favorites">{t("menu.favorites")}</Link>
          </Badge>
        ),
        onClick: () => this.handleClickMenu("/favorites"),
      },
      {
        key: "help",
        icon: <QuestionCircleOutlined />,
        label: <Link to="/help">{t("menu.help")}</Link>,
        onClick: () => this.handleClickMenu("/help"),
      },
    ];

    return (
      <div className="navbar">
        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal"
          items={items}
        />

        <div className="navbar__logo">
          <span>CSGO</span>
          <span>.TV</span>
        </div>

        <Menu
          onClick={this.handleClick}
          selectedKeys={[current]}
          mode="horizontal"
          className="right-menu"
          items={[]}
        />
        <div className="navbar_theme">
          <SetTheme />
        </div>
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
