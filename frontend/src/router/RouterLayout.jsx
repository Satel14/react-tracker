import React, { useState, useEffect, Suspense } from "react";
import ErrorPage from "../pages/ErrorPage";
import { Route, Routes, useLocation } from "react-router-dom";
import { LazyMotion, domAnimation } from "framer-motion";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import routes from "./routes";
import Navbar from "../component/Navbar";
import Footer from "../component/Footer";
import CookieRules from "../component/CookieRule";
import themes from "../component/config/themes";
import "../style/style.scss";

const DEFAULT_THEME = "brown";

const RouteFallback = () => (
  <div className="content__loading">
    <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: "#fde82b" }} spin />} />
  </div>
);

const getInitialTheme = () => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const savedTheme = window.localStorage?.getItem("theme");
    return savedTheme && themes[savedTheme] ? savedTheme : DEFAULT_THEME;
  } catch (_e) {
    return DEFAULT_THEME;
  }
};

const RouterLayout = () => {
  const location = useLocation();
  const [currentTheme, setCurrentTheme] = useState(getInitialTheme);

  useEffect(() => {
    // Expose theme setter for legacy SetTheme component
    window.App = {
      changeTheme: (theme) => setCurrentTheme(theme)
    };
    return () => {
      delete window.App;
    };
  }, []);

  const isChromeless = location.pathname.startsWith("/overlay/");

  return (
    <LazyMotion features={domAnimation}>
      {isChromeless ? (
        <div className="app app--chromeless">
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              {routes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={<route.component />}
                />
              ))}
              <Route path="*" element={<ErrorPage />} />
            </Routes>
          </Suspense>
        </div>
      ) : (
        <div className={"app " + currentTheme}>
          <Navbar />
          <div className="content">
            <Suspense fallback={<RouteFallback />}>
              <Routes location={location}>
                {routes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<route.component />}
                  />
                ))}
                <Route path="*" element={<ErrorPage />} />
              </Routes>
            </Suspense>
          </div>
          <Footer />
          <CookieRules />
        </div>
      )}
    </LazyMotion>
  );
};

export default RouterLayout;
