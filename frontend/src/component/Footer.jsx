import React from "react";
import { translate } from "react-switch-lang";

class Footer extends React.Component {
  render() {
    const { t } = this.props;
    return (
      <div className="footer">
        {t("footer.text1")}
        {t("footer.text2")}
        <a href="next14next@gmail.com" title="Mail Next" target="_blank">
          {t("other.words.contactMe")}
        </a>
        <a href="next14next@gmail.com" title="Mail Next" target="_blank">
          {t("other.words.aboutMe")}
        </a>
      </div>
    );
  }
}

export default translate(Footer);
