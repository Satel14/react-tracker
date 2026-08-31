import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Menu, Badge } from "antd";
import { translate } from "react-switch-lang";
import {
  HomeOutlined,
  TrophyOutlined,
  HeartOutlined,
  QuestionCircleOutlined,
  MenuOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SetLanguage from "../Language/SetLanguage";
import SetTheme from './SetTheme';
import { FAVORITES_UPDATED_EVENT, getFavoritesCount } from "../cookie/store";

// One descriptor per destination. The desktop menus, the phone drawer and the
// selected-key effect all read from these, so a path cannot drift between the
// three places that used to spell it out separately.
const navItems = [
  { key: "main", path: "/", icon: <HomeOutlined /> },
  { key: "favorites", path: "/favorites", icon: <HeartOutlined /> },
  { key: "help", path: "/help", icon: <QuestionCircleOutlined /> },
];

const rightNavItems = [
  { key: "leaderboards", path: "/leaderboards", icon: <TrophyOutlined /> },
];

const allNavItems = [...navItems, ...rightNavItems];

const MOBILE_BREAKPOINT = 960;

// Links activate on Enter alone. These rows were divs with a Space handler, so
// without this Space silently stops working for keyboard users.
const activateOnSpace = (e) => {
  if (e.key === " ") {
    e.preventDefault();
    e.currentTarget.click();
  }
};

const Navbar = ({ t }) => {
  const [current, setCurrent] = useState("home");
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const match = allNavItems.find((item) => item.path === location.pathname);
    setCurrent(match ? match.key : "");
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

  // The badge wraps the link rather than the other way round: its count sits
  // outside the anchor, so it stays out of the link's accessible name.
  const menuLabel = (item) => {
    const link = <Link to={item.path}>{t(`menu.${item.key}`)}</Link>;
    if (item.key !== "favorites") return link;
    return (
      <Badge
        count={favoritesCount}
        size="small"
        showZero={false}
        overflowCount={99}
        className="navbar__favorites-badge"
      >
        {link}
      </Badge>
    );
  };

  const toMenuItem = (item) => ({
    key: item.key,
    icon: item.icon,
    label: menuLabel(item),
    // The anchor handles clicks on the label itself. Ant Design renders the icon
    // as a sibling of the label span and pads the item, and the anchor's overlay
    // is trapped inside that span -- so this catches the icon and the padding,
    // which would otherwise look clickable and do nothing.
    onClick: ({ domEvent }) => {
      if (domEvent?.target?.closest?.("a")) return;
      navigate(item.path);
    },
  });

  const items = navItems.map(toMenuItem);
  const rightItems = rightNavItems.map(toMenuItem);

  return (
    <div className="navbar">
      {!isMobile && (
        <>
          <Menu
            selectedKeys={[current]}
            mode="horizontal"
            items={items}
          />

          <Link
            className="navbar__logo"
            to="/"
            onKeyDown={activateOnSpace}
            aria-label={t("menu.main")}
          >
            <span className="navbar__logo-main">PUBG</span>
            <span className="navbar__logo-tracker">.TRACKER</span>
          </Link>

          <Menu
            selectedKeys={[current]}
            mode="horizontal"
            className="right-menu"
            items={rightItems}
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
          <Link
            className="navbar__logo"
            to="/"
            onKeyDown={activateOnSpace}
            aria-label={t("menu.main")}
          >
            <span className="navbar__logo-main">PUBG</span>
            <span className="navbar__logo-tracker">.TRACKER</span>
          </Link>

          <button
            className="navbar__burger"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <CloseOutlined /> : <MenuOutlined />}
          </button>

          {/* Mounted whether or not the drawer is open: Google crawls at a phone
              viewport, where these are the only nav anchors on the page. Behind
              `mobileOpen` they would exist for nobody but a tap. */}
          <div
            className={`navbar__mobile-overlay ${mobileOpen ? "" : "navbar__mobile-overlay--closed"}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMobileOpen(false);
            }}
            role="button"
            tabIndex={0}
            aria-label={t("menu.main")}
          >
            <div className="navbar__mobile-drawer">
              <div className="navbar__mobile-items">
                {allNavItems.map((item) => (
                  <Link
                    key={item.key}
                    to={item.path}
                    className={`navbar__mobile-item ${current === item.key ? "active" : ""}`}
                    // Navigating closes the drawer through the location effect,
                    // but tapping the route you are already on changes no
                    // location -- so close it here too.
                    onClick={() => setMobileOpen(false)}
                    onKeyDown={activateOnSpace}
                  >
                    {item.icon}
                    <span>{t(`menu.${item.key}`)}</span>
                  </Link>
                ))}
              </div>
              <div className="navbar__mobile-controls">
                <SetTheme />
                <SetLanguage />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

Navbar.propTypes = {
  t: PropTypes.func.isRequired,
};

export default translate(Navbar);
