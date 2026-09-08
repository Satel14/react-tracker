import React, { useMemo, useState } from "react";
import { Collapse, Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { translate } from "react-switch-lang";
import EmptyState from "../component/EmptyState";

// Reading order, and it is the dictionary's order too -- the questions a player
// arrives with come first (how do I find someone, which platform, which
// season), and the ones about this site come last.
const FAQ_KEYS = [
  "search",
  "platforms",
  "season",
  "history",
  "missingStats",
  "rankedRp",
  "limits",
  "avatar",
  "reports",
  "favorites",
];

const Help = ({ t }) => {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return FAQ_KEYS.flatMap((key, index) => {
      const question = t(`pages.help.faq.${key}.q`);
      const answer = t(`pages.help.faq.${key}.a`);
      const matches =
        !normalizedQuery ||
        question.toLowerCase().includes(normalizedQuery) ||
        answer.toLowerCase().includes(normalizedQuery);
      if (!matches) return [];
      return [{
        key: String(index + 1),
        label: question,
        children: <p>{answer}</p>,
        // rc-collapse renders a closed panel's content as null, so every
        // answer on this page existed only after someone clicked it: not in
        // the DOM, not findable with Ctrl+F, and not readable by anything that
        // renders the page and reads what it finds. Per item rather than
        // defaultActiveKey, because `accordion` would then hold exactly one
        // panel open and the rest would go back to being nothing.
        forceRender: true,
      }];
    });
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
        <EmptyState className="help-page__empty">{t("pages.help.empty")}</EmptyState>
      )}

      <p className="help-page__note">{t("pages.help.contact")}</p>
    </div>
  );
};

export default translate(Help);
