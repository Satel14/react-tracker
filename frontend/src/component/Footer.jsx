import React from "react";
import { BugOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";

class Footer extends React.Component {
  render() {
    const { t } = this.props;
    return (
      <div className="footer">
        <div className="footer-text">
          {t("footer.text1")}
        </div>
        <b>
          {t("footer.text2")}
        </b>
        <div className="copyright">
          {t("footer.developed")}
          <a href="mailto:ostaplvov@gmail.com"
            title="Mail Ostap"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#fff" }}
          >
          </a>
        </div>
        <div className="footer-menu">
          <Link to="/bugreport" className="footer-bug-report" aria-label={t("footer.bugReport")}>
            <BugOutlined />
            <span>{t("footer.bugReport")}</span>
          </Link>
        </div>
      </div>
    );
  }
}

export default translate(Footer);
