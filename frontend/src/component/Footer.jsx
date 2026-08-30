import React from "react";
import { BugOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";

const AUTHOR_EMAIL = "ostaplvov@gmail.com";

const Footer = ({ t }) => (
  <footer className="footer">
    <div className="footer__top">
      <div className="footer__lead">
        <p className="footer__tagline">{t("footer.tagline")}</p>
        <p className="footer__summary">{t("footer.summary")}</p>
        <p className="footer__help">{t("footer.helpLine")}</p>
      </div>
      {/* aria-hidden keeps antd's own aria-label="bug" out of the link name. */}
      <Link to="/bugreport" className="footer__action">
        <BugOutlined aria-hidden="true" />
        <span>{t("footer.bugReport")}</span>
      </Link>
    </div>
    <div className="footer__legal">
      <p className="footer__credit">
        <span>{t("footer.developed")}</span>
        <a className="footer__mail" href={`mailto:${AUTHOR_EMAIL}`}>
          {t("footer.contact")}
        </a>
      </p>
      <p className="footer__disclaimer">{t("footer.disclaimer")}</p>
    </div>
  </footer>
);

export default translate(Footer);
