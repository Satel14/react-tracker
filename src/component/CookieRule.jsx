import React, { useState } from "react";
import { Button } from "antd";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";

const CookieRule = (props) => {
  const [show, setShow] = useState(true);
  const { t } = props;
  const toggle = () => {
    setShow(!show);
    localStorage.setItem("cookierulebro", 1);
  };
  const cookiesogl = localStorage.getItem("cookierulebro");
  return (
    <>
      {cookiesogl == null && show && (
        <div className="site-cookie">
          <div className="site-cookie-block">
            <div>{t("We use cookies on our website to save searched players history, and for page Favorites. By clicking 'Accept', you consent to the use All the cookies")}</div>
            <Button type="primary" className="button-accept" onClick={toggle}>
              {t("Accept")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default translate(CookieRule);
