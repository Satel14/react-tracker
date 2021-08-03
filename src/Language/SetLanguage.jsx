import React from "react";
import PropTypes from "prop-types";
import { Menu, Dropdown } from "antd";
import { DownOutlined } from "@ant-design/icons";
import {
  setTranslations,
  setDefaultlanguage,
  setLanguage,
  translate,
} from 'react-switch-lang';
import en from ".en/json";
import ru from ".ru/json";

const languages = ["en", "ru"];
setTranslations({ en, ru });
setDefaultlanguage("en ");

class SomeComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      currentLang: "en",
    };
  }
  handleSetLanguage = (key) => () => {
    setLanguage(key);
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
          key="ru"
          className={this.state.currentLang === "ru" && "dropdown-lang-active"}
          onClick={this.handleSetLanguage("ru")}
        >
          RU
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
