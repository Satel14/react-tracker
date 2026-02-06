import React from "react";
import PropTypes from "prop-types";
import { Dropdown } from "antd";
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
    localStorage.setItem("lang", key);
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
    const items = [
      {
        key: "eng",
        label: "EN",
        className: this.state.currentLang === "en" ? "dropdown-lang-active" : "",
        onClick: this.handleSetLanguage("en"),
      },
      {
        key: "ua",
        label: "UA",
        className: this.state.currentLang === "ua" ? "dropdown-lang-active" : "",
        onClick: this.handleSetLanguage("ua"),
      },
    ];

    return (
      <Dropdown menu={{ items }} className="dropdown-lang">
        <span>
          {this.state.currentLang} <DownOutlined />
        </span>
      </Dropdown>
    );
  }
}


SomeComponent.propTypes = {
  t: PropTypes.func.isRequired,
};

export default translate(SomeComponent);

