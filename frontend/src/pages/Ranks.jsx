import React from "react";
import { Link, useLocation } from "react-router-dom";
import { translate } from "react-switch-lang";
import { RANK_LADDER, SURVIVOR_SLOTS, DIVISION_PIPS } from "../helpers/rankLadder";
import TierDistribution from "../component/ranks/TierDistribution";

// Section key -> how many paragraphs it has. Spelled out rather than derived so
// a translation that loses a paragraph fails the i18n parity guard instead of
// quietly rendering one section shorter than the other language.
//
// `tone` picks a panel treatment. Grandmaster is the only correction on a page
// of statements, and it is the thing people arrive searching for, so it reads
// as a correction instead of as the third fact in a row.
const SECTIONS = [
  { key: "ladder", paragraphs: 4, ladder: true },
  { key: "distribution", paragraphs: 4, distribution: true },
  { key: "grandmaster", paragraphs: 3, tone: "myth" },
  { key: "howRpMoves", paragraphs: 5 },
  { key: "tierProtection", paragraphs: 6 },
  { key: "survivorTier", paragraphs: 6, slots: true },
  { key: "rpDecay", paragraphs: 3 },
  { key: "update421", paragraphs: 7 },
  { key: "queuesAndMaps", paragraphs: 5 },
  { key: "seasonSchedule", paragraphs: 4 },
  { key: "whatWeDoNotClaim", paragraphs: 5 },
];

// The four numbers this page can put in large type: each is published by
// KRAFTON and not since contradicted. The per-match RP swing is deliberately
// absent -- Season 36 capped it at -44/+44 and Update 42.1 stacked bonuses on
// top without restating the cap, so the copy refuses to call it current, and a
// headline number may not claim what the paragraph under it disowns.
const KEY_FACTS = ["tiers", "survivorRp", "protection", "decay"];

const LARGEST_REGION = Math.max(...SURVIVOR_SLOTS.map((region) => region.slots));

const paragraphKeys = (count) => Array.from({ length: count }, (_, i) => `p${i + 1}`);

const KeyFacts = ({ t }) => (
  <ul className="ranks-page__facts">
    {KEY_FACTS.map((fact) => (
      <li className="ranks-page__fact" key={fact}>
        <b className="ranks-page__fact-value">{t(`pages.ranks.keyFacts.${fact}.value`)}</b>
        <span className="ranks-page__fact-label">{t(`pages.ranks.keyFacts.${fact}.label`)}</span>
      </li>
    ))}
  </ul>
);

// Reuses each section's own heading rather than a second set of short labels:
// a nav entry that drifts from the heading it points at is worse than a long
// one, and it would need translating twice.
const TableOfContents = ({ t }) => (
  <nav className="ranks-page__toc" aria-label={t("pages.ranks.onThisPage")}>
    <p className="ranks-page__toc-title">{t("pages.ranks.onThisPage")}</p>
    <ol className="ranks-page__toc-list">
      {SECTIONS.map((section) => (
        <li key={section.key}>
          <a href={`#${section.key}`}>{t(`pages.ranks.${section.key}.heading`)}</a>
        </li>
      ))}
    </ol>
  </nav>
);

const LadderTable = ({ t }) => (
  <ol className="ranks-page__ladder">
    {RANK_LADDER.map((tier) => (
      <li key={tier.key} className={`ranks-page__tier ranks-page__tier--${tier.key}`}>
        <img
          className="ranks-page__tier-icon"
          src={tier.iconUrl}
          alt=""
          width="44"
          height="44"
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
        {/* Decoration, not content: the line above already says it in prose,
            and a screen reader spelling out four roman numerals per tier adds
            nothing but length. */}
        {tier.divisions > 1 && (
          <ol className="ranks-page__tier-pips" aria-hidden="true">
            {DIVISION_PIPS.slice(-tier.divisions).map((pip) => (
              <li key={pip}>{pip}</li>
            ))}
          </ol>
        )}
      </li>
    ))}
  </ol>
);

// The seat counts KRAFTON published with Update 36.1. Rendered as a list
// rather than a chart: seven numbers do not need recharts, and that chunk is
// 408 KB kept off every page that is meant to rank. The bar is a CSS width off
// the largest region, which is the whole of what a chart would have drawn.
const SurvivorSlots = ({ t }) => {
  const total = SURVIVOR_SLOTS.reduce((sum, region) => sum + region.slots, 0);
  return (
    <div className="ranks-page__slots">
      <h3>{t("pages.ranks.survivorTier.slotsHeading")}</h3>
      <ul>
        {SURVIVOR_SLOTS.map((region) => (
          <li className="ranks-page__slot" key={region.key}>
            <span className="ranks-page__slot-name">
              {t(`pages.ranks.survivorTier.region.${region.key}`)}
            </span>
            <span className="ranks-page__slot-bar" aria-hidden="true">
              <span style={{ width: `${(region.slots / LARGEST_REGION) * 100}%` }} />
            </span>
            <b>{region.slots}</b>
          </li>
        ))}
      </ul>
      <p>{t("pages.ranks.survivorTier.slotsTotal", { total })}</p>
    </div>
  );
};

// Labelled in the language it leads to, and not translated: someone who cannot
// read this page still recognises the name of their own language. It renders
// into the static shell too, which is the only path a crawler that runs no
// JavaScript has between the two versions.
const OtherLanguage = () => {
  const { pathname } = useLocation();
  return pathname === "/ua/ranks" ? (
    <Link className="ranks-page__lang" to="/ranks" lang="en">
      Read in English
    </Link>
  ) : (
    <Link className="ranks-page__lang" to="/ua/ranks" lang="uk">
      Читати українською
    </Link>
  );
};

const Ranks = ({ t }) => (
  <div className="content ranks-page">
    <div className="ranks-page__hero">
      {/* Matches the heading the prerendered shell puts in #root, so the text a
          crawler reads and the text React renders are the same sentence. */}
      <h1>{t("pages.ranks.title")}</h1>
      <p>{t("pages.ranks.intro")}</p>
      <OtherLanguage />
      <KeyFacts t={t} />
    </div>

    <div className="ranks-page__body">
      <TableOfContents t={t} />

      <div className="ranks-page__sections">
        {SECTIONS.map((section, index) => (
          <section
            className={`ranks-page__section${
              section.tone ? ` ranks-page__section--${section.tone}` : ""
            }`}
            id={section.key}
            key={section.key}
          >
            <div className="ranks-page__section-head">
              <span className="ranks-page__section-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2>{t(`pages.ranks.${section.key}.heading`)}</h2>
            </div>
            {section.ladder && <LadderTable t={t} />}
            {/* Before the prose, like the ladder table above it: the heading
                asks where players sit and the bars are the answer. The four
                paragraphs under them are the caveats, which nobody reads
                first. */}
            {section.distribution && <TierDistribution t={t} />}
            {paragraphKeys(section.paragraphs).map((paragraph) => (
              <p key={paragraph}>{t(`pages.ranks.${section.key}.${paragraph}`)}</p>
            ))}
            {/* After the prose, not before it: p4 is the sentence that hands
                over the numbers the table then draws. */}
            {section.slots && <SurvivorSlots t={t} />}
          </section>
        ))}

        <p className="ranks-page__outro">
          <Link to="/leaderboards">{t("pages.ranks.seeLeaderboards")}</Link>
        </p>
      </div>
    </div>
  </div>
);

export default translate(Ranks);
