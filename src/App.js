import React from "react";
import "./style/style.scss";
import Navbar from ".//component/Navbar";
import PlayerPage from "./pages/PlayerPage";
import Footer from "./component/Footer";
import Player from "./pages/Player";
import Main from "./pages/Main";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";
import Help from "./pages/Help";
import ErrorPage from "./pages/ErrorPage";
import CookieRules from './component/CookieRule'

const App = (props) => {
  return (
    <Router>
      <div className="app night">
        <Navbar />
        {props.children}
        <Switch>
          <Route path="/home" >
          <Main />
          <Footer/>
          <CookieRules/>
          </Route>
          <Route path="/playerpage" >
          <PlayerPage />
          <Footer />
          <CookieRules/>
          </Route>
          <Route path="error">
            <ErrorPage/>
          </Route>
        </Switch>
      </div>
    </Router>
  );
};

export default App;
