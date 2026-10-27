import React from "react";
import { BugOutlined, HeartOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";

const AUTHOR_EMAIL = "ostaplvov@gmail.com";
const DONATE_URL = "https://send.monobank.ua/jar/6CkbEbsxW4";

const Footer = ({ t }) => (
  <footer className="footer">
    <div className="footer__top">
      <div className="footer__lead">
        <p className="footer__tagline">{t("footer.tagline")}</p>
        <p className="footer__summary">{t("footer.summary")}</p>
        <p className="footer__help">{t("footer.helpLine")}</p>
      </div>
      <div className="footer__actions">
        {/* aria-hidden keeps antd's own aria-label="bug" out of the link name. */}
        <Link to="/bugreport" className="footer__action">
          <BugOutlined aria-hidden="true" />
          <span>{t("footer.bugReport")}</span>
        </Link>
        <a className="footer__action" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
          <HeartOutlined aria-hidden="true" />
          <span>{t("footer.support")}</span>
        </a>
        <p className="footer__note">{t("footer.supportNote")}</p>
      </div>
    </div>
    <div className="footer__legal">
      <p className="footer__credit">
        <span>{t("footer.developed")}</span>
        <a className="footer__mail" href={`mailto:${AUTHOR_EMAIL}`}>
          {t("footer.contact")}
        </a>
      </p>
      <p className="footer__disclaimer">{t("footer.disclaimer")}</p>
      <p className="footer__disclaimer">{t("footer.trademark")}</p>
    </div>
  </footer>
);

export default translate(Footer);
