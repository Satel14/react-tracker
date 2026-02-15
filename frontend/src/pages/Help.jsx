import React from "react";
import { Collapse } from "antd";
import { translate } from "react-switch-lang";

const FAQ_KEYS = [
  "search",
  "season",
  "missingStats",
  "avatar",
  "reports",
  "favorites",
  "limits",
  "platforms",
];

const Help = ({ t }) => {
  const items = FAQ_KEYS.map((key, index) => ({
    key: String(index + 1),
    label: t(`pages.help.faq.${key}.q`),
    children: <p>{t(`pages.help.faq.${key}.a`)}</p>,
  }));

  return (
    <div className="content help-page">
      <div className="help-page__hero">
        <h1>{t("pages.help.title")}</h1>
        <p>{t("pages.help.subtitle")}</p>
      </div>

      <Collapse className="help-page__faq" accordion items={items} />

      <p className="help-page__note">{t("pages.help.contact")}</p>
    </div>
  );
};

export default translate(Help);
