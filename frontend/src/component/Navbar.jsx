import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Menu, Badge } from "antd";
import { translate } from "react-switch-lang";
import {
  HomeOutlined,
  HeartOutlined,
  QuestionCircleOutlined,
  MenuOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import SetLanguage from "../Language/SetLanguage";
import SetTheme from './SetTheme';
import { FAVORITES_UPDATED_EVENT, getFavoritesCount } from "../cookie/store";

const componentRoutes = ["/", "/leaderboards", "/favorites", "/help"];
const MOBILE_BREAKPOINT = 768;

const Navbar = ({ t }) => {
  const [current, setCurrent] = useState("home");
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
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
    setMobileOpen(false);
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

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

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
        <Badge
          count={favoritesCount}
          size="small"
          showZero={false}
          overflowCount={99}
          className="navbar__favorites-badge"
        >
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

  const handleMobileNav = (path, key) => {
    setCurrent(key);
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <div className="navbar">
      {!isMobile && (
        <>
          <Menu
            onClick={handleClick}
            selectedKeys={[current]}
            mode="horizontal"
            items={items}
          />

          <div className="navbar__logo" onClick={() => navigate("/")}>
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
        </>
      )}

      {isMobile && (
        <>
          <div className="navbar__logo" onClick={() => navigate("/")}>
            <span className="navbar__logo-main">PUBG</span>
            <span className="navbar__logo-tracker">.TRACKER</span>
          </div>

          <button
            className="navbar__burger"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <CloseOutlined /> : <MenuOutlined />}
          </button>

          {mobileOpen && (
            <div className="navbar__mobile-overlay" onClick={() => setMobileOpen(false)}>
              <div className="navbar__mobile-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="navbar__mobile-items">
                  {items.map((item) => (
                    <div
                      key={item.key}
                      className={`navbar__mobile-item ${current === item.key ? "active" : ""}`}
                      onClick={() => handleMobileNav(
                        item.key === "main" ? "/" : `/${item.key}`,
                        item.key
                      )}
                    >
                      {item.icon}
                      <span>{typeof item.label === "string" ? item.label : t(`menu.${item.key}`)}</span>
                    </div>
                  ))}
                </div>
                <div className="navbar__mobile-controls">
                  <SetTheme />
                  <SetLanguage />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

Navbar.propTypes = {
  t: PropTypes.func.isRequired,
};

export default translate(Navbar);
