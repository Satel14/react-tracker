import React, { useState, useEffect } from 'react';
import themes from './config/themes'
import { Dropdown } from 'antd'
import { FormatPainterOutlined } from "@ant-design/icons";

const SetTheme = () => {
  const [currentTheme, setCurrentTheme] = useState('brown');

  useEffect(() => {
    const localTheme = localStorage.getItem('theme');
    if (localTheme && themes[localTheme]) {
      setCurrentTheme(localTheme);
      if (window.App) {
        window.App.changeTheme(localTheme);
      }
    }
  }, []);

  const handleSetTheme = (key) => () => {
    setCurrentTheme(key);
    localStorage.setItem('theme', key);
    if (window.App) {
      window.App.changeTheme(key);
    }
  };

  const items = Object.keys(themes).map((key) => ({
    key,
    label: <div style={{ background: themes[key], height: 24, width: '100px' }}></div>,
    className: currentTheme === key ? "dropdown-theme-active" : "",
    onClick: handleSetTheme(key),
  }));

  return (
    <Dropdown
      menu={{ items }}
      className="dropdown-theme"
      trigger={["click"]}
    >
      <span>
        <FormatPainterOutlined
          style={{ color: themes[currentTheme] }}
        />
      </span>
    </Dropdown>
  );
};

export default SetTheme;
