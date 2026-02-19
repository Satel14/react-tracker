import React, { useState, useEffect } from "react";
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

const SetLanguage = () => {
  const [currentLang, setCurrentLang] = useState("en");

  useEffect(() => {
    const localLanguage = localStorage.getItem("lang");
    if (localLanguage && languages.includes(localLanguage)) {
      setLanguage(localLanguage);
      setCurrentLang(localLanguage);
    }
  }, []);

  const handleSetLanguage = (key) => () => {
    setLanguage(key);
    localStorage.setItem("lang", key);
    setCurrentLang(key);
  };

  const items = [
    {
      key: "eng",
      label: "EN",
      className: currentLang === "en" ? "dropdown-lang-active" : "",
      onClick: handleSetLanguage("en"),
    },
    {
      key: "ua",
      label: "UA",
      className: currentLang === "ua" ? "dropdown-lang-active" : "",
      onClick: handleSetLanguage("ua"),
    },
  ];

  return (
    <Dropdown menu={{ items }} className="dropdown-lang">
      <span>
        {currentLang.toUpperCase()} <DownOutlined />
      </span>
    </Dropdown>
  );
};

SetLanguage.propTypes = {
  t: PropTypes.func.isRequired,
};

export default translate(SetLanguage);

