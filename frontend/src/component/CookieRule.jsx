import React, { useState } from "react";
import { Button } from "antd";
import { translate } from "react-switch-lang";
import { readStoredItem, writeStoredItem } from "../helpers/browserStorage";

const CookieRule = (props) => {
  const [show, setShow] = useState(true);
  const { t } = props;
  const toggle = () => {
    setShow(!show);
    writeStoredItem("cookierulebro", 1);
  };
  const cookiesogl = readStoredItem("cookierulebro");
  return (
    <>
      {cookiesogl == null && show && (
        <div className="site-cookie">
          <div className="site-cookie-block">
            <div>{t("other.cookie.text")}</div>
            <Button type="primary" className="button-accept" onClick={toggle}>
              {t("other.cookie.accept")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default translate(CookieRule);
