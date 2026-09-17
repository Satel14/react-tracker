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
import RouteErrorBoundary from "../component/RouteErrorBoundary";
import themes from "../component/config/themes";
import { readStoredItem } from "../helpers/browserStorage";
import "../style/style.scss";

const DEFAULT_THEME = "green";

const RouteFallback = () => (
  <div className="content__loading">
    <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: "#fde82b" }} spin />} />
  </div>
);

// A route may bring its own fallback, and then it gets its own boundary: React
// uses the nearest one, so the outer spinner never runs for it. /leaderboards
// does this because the spinner throws away a prerendered page for a frame and
// everything below the swap moves twice -- 0.14 of that page's CLS.
const routeElement = (route) => {
  const element = <route.component />;
  if (!route.fallback) return element;
  const Fallback = route.fallback;
  return <Suspense fallback={<Fallback />}>{element}</Suspense>;
};

const getInitialTheme = () => {
  const savedTheme = readStoredItem("theme");
  return savedTheme && themes[savedTheme] ? savedTheme : DEFAULT_THEME;
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
          <RouteErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Routes location={location}>
                {routes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={routeElement(route)}
                  />
                ))}
                <Route path="*" element={<ErrorPage />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </div>
      ) : (
        <div className={"app " + currentTheme}>
          <Navbar />
          <main className="content">
            <RouteErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<RouteFallback />}>
                <Routes location={location}>
                  {routes.map((route) => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={routeElement(route)}
                    />
                  ))}
                  <Route path="*" element={<ErrorPage />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </main>
          <Footer />
          <CookieRules />
        </div>
      )}
    </LazyMotion>
  );
};

export default RouterLayout;
