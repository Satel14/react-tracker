import React from "react";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";

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
    <h1 className="home-intro__title">{t("pages.main.about.h1")}</h1>
    <p className="home-intro__lead">{t("pages.main.about.lead")}</p>

    {SECTIONS.map((section) => (
      <section className="home-intro__section" key={section.key}>
        <h2>{t(`pages.main.about.${section.key}.heading`)}</h2>
        {paragraphKeys(section.paragraphs).map((key) => (
          <p key={key}>{t(`pages.main.about.${section.key}.${key}`)}</p>
        ))}
      </section>
    ))}

    {/* The only two pages on this site worth indexing besides this one, linked
        from the only page that has any standing in search. */}
    <nav className="home-intro__links" aria-label={t("pages.main.about.h1")}>
      <Link to="/ranks">{t("pages.main.about.ranksLink")}</Link>
      <Link to="/leaderboards">{t("pages.main.about.leaderboardsLink")}</Link>
    </nav>
  </section>
);

export default translate(HomeIntro);
