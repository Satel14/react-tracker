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
import { FAVORITES_UPDATED_EVENT, getFavoritesCount } from "../cookie/store";

const componentRoutes = ["/", "/leaderboards", "/favorites", "/help"];

const Navbar = ({ t }) => {
  const [current, setCurrent] = useState("home");
  const [favoritesCount, setFavoritesCount] = useState(0);
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

  useEffect(() => {
    const loadFavoritesCount = async () => {
      const count = await getFavoritesCount();
      setFavoritesCount(count);
    };

    loadFavoritesCount();

    const onFavoritesUpdated = () => {
      loadFavoritesCount();
    };

    const onStorageUpdated = (event) => {
      if (event.key === "favorites") {
        loadFavoritesCount();
      }
    };

    window.addEventListener(FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    window.addEventListener("storage", onStorageUpdated);

    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
      window.removeEventListener("storage", onStorageUpdated);
    };
  }, []);

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
        <Badge count={favoritesCount} size="small" showZero={false}>
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
        <span className="navbar__logo-main">PUBG</span>
        <span className="navbar__logo-tracker">.TRACKER</span>
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
