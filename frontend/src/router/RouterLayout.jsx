import React, { useState, useEffect } from "react";
import ErrorPage from "../pages/ErrorPage";
import { Route, Routes, useLocation } from "react-router-dom";
import { LazyMotion, domAnimation } from "framer-motion";
import routes from "./routes";
import Navbar from "../component/Navbar";
import Footer from "../component/Footer";
import CookieRules from "../component/CookieRule";
import "../style/style.scss";

const RouterLayout = () => {
  const location = useLocation();
  const [currentTheme, setCurrentTheme] = useState("brown");

  useEffect(() => {
    // Expose theme setter for legacy SetTheme component
    window.App = {
      changeTheme: (theme) => setCurrentTheme(theme)
    };
    return () => {
      delete window.App;
    };
  }, [location]);

  const isChromeless = location.pathname.startsWith("/overlay/");

  return (
    <LazyMotion features={domAnimation}>
      {isChromeless ? (
        <div className="app app--chromeless">
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
        </div>
      ) : (
        <div className={"app " + currentTheme}>
          <Navbar />
          <div className="content">
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
          </div>
          <Footer />
          <CookieRules />
        </div>
      )}
    </LazyMotion>
  );
};

export default RouterLayout;
