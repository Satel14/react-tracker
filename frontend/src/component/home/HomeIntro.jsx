import React from "react";
import { Link } from "react-router-dom";
import { getLanguage, translate } from "react-switch-lang";

// The homepage's body. It is a component rather than copy injected into the
// static shell because the build renders it into that shell (see
// prerenderBody) and the page renders it below the search box: the text a
// crawler reads is the text a visitor sees, by construction.
//
// Section key -> how many paragraphs it has. Spelled out rather than derived
// from the dictionary so a translation that drops a paragraph fails the i18n
// parity guard instead of quietly rendering one language shorter.
const SECTIONS = [
  { key: "lookup", paragraphs: 2 },
  { key: "platforms", paragraphs: 2 },
  { key: "playerPage", paragraphs: 2 },
  { key: "ranked", paragraphs: 2 },
  { key: "data", paragraphs: 2 },
];

const paragraphKeys = (count) => Array.from({ length: count }, (_, index) => `p${index + 1}`);

const HomeIntro = ({ t }) => (
  <section className="home-intro">
    <h2 className="home-intro__title">{t("pages.main.about.h1")}</h2>
    <p className="home-intro__lead">{t("pages.main.about.lead")}</p>

    <section className="home-intro__section home-intro__rp">
      <h2>{t("pages.main.about.rankPoints.heading")}</h2>
      <p>{t("pages.main.about.rankPoints.p1")}</p>
      <p>{t("pages.main.about.rankPoints.p2")}</p>
      <p>
        <Link to={`/${getLanguage() === "ua" ? "ua/" : ""}rank-points`}>
          {t("pages.main.about.rankPoints.link")}
        </Link>
      </p>
    </section>

    {SECTIONS.map((section) => (
      <section className="home-intro__section" key={section.key}>
        <h2>{t(`pages.main.about.${section.key}.heading`)}</h2>
        {paragraphKeys(section.paragraphs).map((key) => (
          <p key={key}>{t(`pages.main.about.${section.key}.${key}`)}</p>
        ))}
      </section>
    ))}

    {/* Related guides remain reachable in both the static and live page. */}
    <nav className="home-intro__links" aria-label={t("pages.main.about.h1")}>
      <Link to="/ranks">{t("pages.main.about.ranksLink")}</Link>
      <Link to="/leaderboards">{t("pages.main.about.leaderboardsLink")}</Link>
    </nav>
  </section>
);

export default translate(HomeIntro);
