import React from "react";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";
import { RANK_LADDER } from "../helpers/rankLadder";

// Section key -> how many paragraphs it has. Spelled out rather than derived so
// a translation that loses a paragraph fails the i18n parity guard instead of
// quietly rendering one section shorter than the other language.
const SECTIONS = [
  { key: "ladder", paragraphs: 4, ladder: true },
  { key: "grandmaster", paragraphs: 3 },
  { key: "howRpMoves", paragraphs: 5 },
  { key: "tierProtection", paragraphs: 6 },
  { key: "survivorTier", paragraphs: 6 },
  { key: "rpDecay", paragraphs: 3 },
  { key: "update421", paragraphs: 7 },
  { key: "queuesAndMaps", paragraphs: 5 },
  { key: "seasonSchedule", paragraphs: 4 },
  { key: "whatWeDoNotClaim", paragraphs: 5 },
];

const paragraphKeys = (count) => Array.from({ length: count }, (_, i) => `p${i + 1}`);

const LadderTable = ({ t }) => (
  <ol className="ranks-page__ladder">
    {RANK_LADDER.map((tier) => (
      <li key={tier.key} className="ranks-page__tier">
        <img
          className="ranks-page__tier-icon"
          src={tier.iconUrl}
          alt=""
          width="40"
          height="40"
          loading="lazy"
          aria-hidden="true"
        />
        <div className="ranks-page__tier-body">
          <p className="ranks-page__tier-name">{t(`pages.ranks.ladder.tier.${tier.key}`)}</p>
          <p className="ranks-page__tier-divisions">
            {tier.divisions === 1
              ? t("pages.ranks.ladder.divisionsSingle")
              : t("pages.ranks.ladder.divisionsPlural", { count: tier.divisions })}
          </p>
        </div>
      </li>
    ))}
  </ol>
);

const Ranks = ({ t }) => (
  <div className="content ranks-page">
    <div className="ranks-page__hero">
      {/* Matches the heading the prerendered shell puts in #root, so the text a
          crawler reads and the text React renders are the same sentence. */}
      <h1>{t("pages.ranks.title")}</h1>
      <p>{t("pages.ranks.intro")}</p>
    </div>

    {SECTIONS.map((section) => (
      <section className="ranks-page__section" key={section.key}>
        <h2>{t(`pages.ranks.${section.key}.heading`)}</h2>
        {section.ladder && <LadderTable t={t} />}
        {paragraphKeys(section.paragraphs).map((paragraph) => (
          <p key={paragraph}>{t(`pages.ranks.${section.key}.${paragraph}`)}</p>
        ))}
      </section>
    ))}

    <p className="ranks-page__outro">
      <Link to="/leaderboards">{t("pages.ranks.seeLeaderboards")}</Link>
    </p>
  </div>
);

export default translate(Ranks);
