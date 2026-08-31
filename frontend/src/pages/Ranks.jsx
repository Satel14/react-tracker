import React from "react";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";
import { RANK_LADDER, SURVIVOR_SLOTS } from "../helpers/rankLadder";

// Section key -> how many paragraphs it has. Spelled out rather than derived so
// a translation that loses a paragraph fails the i18n parity guard instead of
// quietly rendering one section shorter than the other language.
const SECTIONS = [
  { key: "ladder", paragraphs: 4, ladder: true },
  { key: "grandmaster", paragraphs: 3 },
  { key: "howRpMoves", paragraphs: 5 },
  { key: "tierProtection", paragraphs: 6 },
  { key: "survivorTier", paragraphs: 6, slots: true },
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

// The seat counts KRAFTON published with Update 36.1. Rendered as a list
// rather than a chart: seven numbers do not need recharts, and that chunk is
// 408 KB kept off every page that is meant to rank.
const SurvivorSlots = ({ t }) => {
  const total = SURVIVOR_SLOTS.reduce((sum, region) => sum + region.slots, 0);
  return (
    <div className="ranks-page__slots">
      <h3>{t("pages.ranks.survivorTier.slotsHeading")}</h3>
      <ul>
        {SURVIVOR_SLOTS.map((region) => (
          <li className="ranks-page__slot" key={region.key}>
            <span>{t(`pages.ranks.survivorTier.region.${region.key}`)}</span>
            <b>{region.slots}</b>
          </li>
        ))}
      </ul>
      <p>{t("pages.ranks.survivorTier.slotsTotal", { total })}</p>
    </div>
  );
};

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
        {section.slots && <SurvivorSlots t={t} />}
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
