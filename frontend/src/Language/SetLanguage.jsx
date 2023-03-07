import React from "react";
import PropTypes from "prop-types";
import { Menu, Dropdown } from "antd";
import { DownOutlined } from "@ant-design/icons";
import {
  setTranslations,
  setDefaultLanguage,
  setLanguage,
  translate,
} from 'react-switch-lang';
import en from "./en.json"
import ua from "./ua.json"

const languages = ["en", "ua"];


setTranslations({ en, ua });
setDefaultLanguage("en");

class SomeComponent extends React.Component {
  constructor(props) {
    super(props);

    
    this.state = {
      currentLang: "en",
    };
  }


  handleSetLanguage = (key) => () => {
    setLanguage(key);
    localStorage.setItem("lang",key);
    this.setState({
      currentLang: key,
    });
  };

  async componentDidMount() {
    const localLanguage = await localStorage.getItem("lang");

    if (!localLanguage) {
      return;
    }


    if (languages.includes(localLanguage)) {
      setLanguage(localLanguage);
      this.setState({
        currentLang: localLanguage,
      });
    }
  }

  render() {
    const langmenu = (
      <Menu>
        <Menu.Item
          key="eng"
          className={this.state.currentLang === "en" && "dropdown-lang-active"}
          onClick={this.handleSetLanguage("en")}
        >
          EN
        </Menu.Item>
        <Menu.Item
          key="ua"
          onClick={this.handleSetLanguage("ua")}
          className={this.state.currentLang === "ua" && "dropdown-lang-active"}
          
        >
          UA
        </Menu.Item>
      </Menu>
    );

    return (
        <Dropdown overlay={langmenu} className="dropdown-lang">
            <span>
                {this.state.currentLang} <DownOutlined/>
            </span>
        </Dropdown>
    );
  }
}

SomeComponent.propTypes = {
  t: PropTypes.func.isRequired,
};
 
export default translate(SomeComponent);

