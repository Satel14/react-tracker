import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import "./style/style.scss";
import Navbar from "./component/Navbar";
import Footer from "./component/Footer";
import CookieRules from './component/CookieRule';

const App = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState("brown");
  const location = useLocation(); // Force re-render on route change

  useEffect(() => {
    // Expose theme setter for legacy components if needed, or remove if SetTheme is verified to work independently
    window.App = {
      changeTheme: (theme) => setCurrentTheme(theme)
    };
    return () => {
      delete window.App;
    };
  }, [location]); // Re-run effect on route change (optional, but good for tracking)

  return (
    <div className={"app " + currentTheme}>
      <Navbar />
      <div className="content">
        {children}
      </div>
      <Footer />
      <CookieRules />
    </div>
  );
};

export default App;


