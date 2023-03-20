import React, { Component } from 'react';
import "./style/style.scss";
import Navbar from "./component/Navbar";
import Footer from "./component/Footer";
import CookieRules from './component/CookieRule'


class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      currentTheme: "brown",
    }

    window.App = this;
  }

  changeTheme(theme) {
    this.setState({
      currentTheme: theme,
    })
  }
  render() {
    const { currentTheme } = this.state;
    return (
      <div className={"app " + currentTheme}>
        <Navbar />
        <div className="content">
          {this.props.children}
        </div>
        <Footer />
        <CookieRules />
      </div>
    );
  }
}

export default App;


