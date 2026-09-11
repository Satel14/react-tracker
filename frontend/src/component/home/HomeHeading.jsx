import React from "react";
import { translate } from "react-switch-lang";

// Shared by the interactive homepage and its static HTML shell.
const HomeHeading = ({ t }) => (
  <header className="home-heading">
    <h1>{t("pages.main.title")}</h1>
    <p>{t("pages.main.subtitle")}</p>
  </header>
);

export default translate(HomeHeading);
