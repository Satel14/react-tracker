import React from "react";
import { Link } from "react-router-dom";
import { getLanguage, translate } from "react-switch-lang";

const HomeGuideLinks = ({ t }) => {
  const prefix = getLanguage() === "ua" ? "ua/" : "";
  return (
    <nav className="home-guide-links" aria-label={t("pages.main.guides.label")}>
      <Link to={`/${prefix}ranks`}>{t("pages.main.guides.ranks")}</Link>
      <span aria-hidden="true">·</span>
      <Link to={`/${prefix}rank-points`}>{t("pages.main.guides.rankPoints")}</Link>
    </nav>
  );
};

export default translate(HomeGuideLinks);
