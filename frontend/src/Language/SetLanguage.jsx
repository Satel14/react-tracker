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
import { useLocation, useNavigate } from "react-router-dom";
import en from "./en.json"
import ua from "./ua.json"
import { chooseLanguage, DEFAULT_LANGUAGE } from "./chooseLanguage";
import { translationFor } from "../helpers/routeMeta";

setTranslations({ en, ua });
setDefaultLanguage(DEFAULT_LANGUAGE);

const SetLanguage = () => {
  const [currentLang, setCurrentLang] = useState(DEFAULT_LANGUAGE);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Runs on every navigation, not once: walking from /ranks to /ua/ranks has to
  // change the language the same way arriving on it does.
  useEffect(() => {
    const chosen = chooseLanguage({ pathname, stored: localStorage.getItem("lang") });
    setLanguage(chosen);
    setCurrentLang(chosen);
  }, [pathname]);

  const handleSetLanguage = (key) => () => {
    setLanguage(key);
    localStorage.setItem("lang", key);
    setCurrentLang(key);
    // On a page that exists in both languages the URL carries the language, so
    // switching in place would leave the address and the text disagreeing --
    // and the address is what gets shared.
    const target = translationFor(pathname, key);
    if (target) navigate(target);
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

