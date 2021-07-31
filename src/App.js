import React from "react";
import "./style/style.scss";
import Navbar from ".//component/Navbar";
import PlayerPage from "./pages/PlayerPage";
import Footer from "./component/Footer"
import Player from "./pages/Player";


const App = (props) => {
  return (
    <div className="app night">
      <Navbar/>
      {props.children}
      <PlayerPage />
      <Footer/>
    </div>
  );
}

export default App;
