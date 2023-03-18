import React from "react";
import "./style/style.scss";
import Navbar from ".//component/Navbar";
import Footer from "./component/Footer";
import CookieRules from './component/CookieRule'

const App = (props) => {
  return (
    <div className="app night">
      <Navbar />
      <div className="content">
        {props.children}
      </div>
      <Footer />
      <CookieRules />
    </div>
  );
};

export default App;
