import React from "react";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";

// The two halves of /leaderboards that are words rather than data.
//
// They are components, not copy written into the static shell, because the
// build renders them into that shell (see prerenderBody) while the live page
// renders the very same two around its table. That is what stops the file a
// crawler reads drifting from the page a visitor sees -- the drift this page
// had until now, where the shell said "PUBG ranked leaderboards" and React
// rendered an h2 saying "Leaderboards".
//
// The table itself is deliberately not prerendered: it is live standings, so a
// build-time copy would need a call to an API that sleeps and would ship a
// crawler numbers that stopped matching the page the moment they were written.

// Section key -> how many paragraphs it has. Spelled out rather than counted
// from the dictionary, so a translation that loses a paragraph fails the i18n
// parity guard instead of quietly rendering one language shorter.
const SECTIONS = [
  { key: "ladders", paragraphs: 2 },
  { key: "rpNotWins", paragraphs: 2 },
  { key: "scope", paragraphs: 2 },
  { key: "data", paragraphs: 2 },
];

const paragraphKeys = (count) => Array.from({ length: count }, (_, index) => `p${index + 1}`);

// The page's heading, which the shell also carries. Its text lives in the
// dictionary and routeMeta reads the same words, pinned by Leaderboard.test.jsx.
export const LeaderboardHeading = translate(({ t }) => (
  <div className="leaderboard-page__head">
    <h1>{t("pages.leaderboards.title")}</h1>
    <p>{t("pages.leaderboards.subtitle")}</p>
    <p className="leaderboard-page__explainer">
      <Link to="/ranks">{t("pages.leaderboards.ranksLink")}</Link>
    </p>
  </div>
));

// Below the table on the live page: somebody who came for the standings should
// reach them first, and the reader who wants to know why a top-500 win rate
// looks ordinary is already scrolling.
export const LeaderboardIntro = translate(({ t }) => (
  <section className="leaderboard-intro">
    <p className="leaderboard-intro__lead">{t("pages.leaderboards.about.lead")}</p>

    {SECTIONS.map((section) => (
      <section className="leaderboard-intro__section" key={section.key}>
        <h2>{t(`pages.leaderboards.about.${section.key}.heading`)}</h2>
        {paragraphKeys(section.paragraphs).map((key) => (
          <p key={key}>{t(`pages.leaderboards.about.${section.key}.${key}`)}</p>
        ))}
      </section>
    ))}

    {/* The one page that answers the question this one cannot, and the only
        internal link out of here that a crawler with no JavaScript can find. */}
    <p className="leaderboard-intro__link">
      <Link to="/ranks">{t("pages.leaderboards.about.distributionLink")}</Link>
    </p>
  </section>
));

// What the build writes into leaderboards.html: the heading, then the prose,
// with nothing where the table will be. Both halves are the components the page
// renders, so neither can drift from the file.
const LeaderboardStatic = () => (
  <>
    <LeaderboardHeading />
    <LeaderboardIntro />
  </>
);

export default LeaderboardStatic;
