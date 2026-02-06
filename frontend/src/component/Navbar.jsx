import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Menu, Badge } from "antd";
import { translate } from "react-switch-lang";
import {
  HomeOutlined,
  HeartOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import SetLanguage from "../Language/SetLanguage";
import SetTheme from './SetTheme';

const componentRoutes = ["/", "/leaderboards", "/favorites", "/help"];

const Navbar = ({ t }) => {
  const [current, setCurrent] = useState("home");
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (e) => {
    setCurrent(e.key);
  };

  useEffect(() => {
    const url = location.pathname;
    const isComponentRoute = componentRoutes.includes(url);

    if (isComponentRoute) {
      setCurrent(url === "/" ? "main" : url.replace("/", ""));
    } else {
      setCurrent("");
    }
  }, [location]);

  const items = [
    {
      key: "main",
      icon: <HomeOutlined />,
      label: t("menu.main"),
      onClick: () => navigate("/"),
    },
    {
      key: "favorites",
      icon: <HeartOutlined />,
      label: (
        <Badge count={10}>
          {t("menu.favorites")}
        </Badge>
      ),
      onClick: () => navigate("/favorites"),
    },
    {
      key: "help",
      icon: <QuestionCircleOutlined />,
      label: t("menu.help"),
      onClick: () => navigate("/help"),
    },
  ];

  return (
    <div className="navbar">
      <Menu
        onClick={handleClick}
        selectedKeys={[current]}
        mode="horizontal"
        items={items}
      />

      <div className="navbar__logo">
        <span>CSGO</span>
        <span>.TV</span>
      </div>

      <Menu
        onClick={handleClick}
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
};

Navbar.propTypes = {
  t: PropTypes.func.isRequired,
};

export default translate(Navbar);
