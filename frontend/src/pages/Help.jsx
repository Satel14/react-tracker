import React, { useMemo, useState } from "react";
import { Collapse, Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
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
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return FAQ_KEYS
      .map((key, index) => {
        const question = t(`pages.help.faq.${key}.q`);
        const answer = t(`pages.help.faq.${key}.a`);
        const matches =
          !normalizedQuery ||
          question.toLowerCase().includes(normalizedQuery) ||
          answer.toLowerCase().includes(normalizedQuery);
        if (!matches) return null;
        return {
          key: String(index + 1),
          label: question,
          children: <p>{answer}</p>,
        };
      })
      .filter(Boolean);
  }, [query, t]);

  return (
    <div className="content help-page">
      <div className="help-page__hero">
        <h1>{t("pages.help.title")}</h1>
        <p>{t("pages.help.subtitle")}</p>
      </div>

      <Input
        className="help-page__search"
        size="large"
        prefix={<SearchOutlined />}
        placeholder={t("pages.help.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        allowClear
      />

      {items.length ? (
        <Collapse className="help-page__faq" accordion items={items} />
      ) : (
        <div className="help-page__empty">{t("pages.help.empty")}</div>
      )}

      <p className="help-page__note">{t("pages.help.contact")}</p>
    </div>
  );
};

export default translate(Help);
