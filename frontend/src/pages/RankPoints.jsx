import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { translate } from "react-switch-lang";
import { getRankDistribution } from "../api/census";
import { CENSUS_SNAPSHOT, rpTable } from "../helpers/censusSnapshot";
import RankPointsTable from "../component/rankPoints/RankPointsTable";
import RankPointsLookup from "../component/rankPoints/RankPointsLookup";

// Section key -> how many paragraphs it has. Spelled out rather than derived, so
// a translation that loses a paragraph fails the copy guard instead of quietly
// rendering one language shorter than the other.
const SECTIONS = [
  { key: "method", paragraphs: 2 },
  { key: "limits", paragraphs: 5 },
];

const paragraphKeys = (count) => Array.from({ length: count }, (_, i) => `p${i + 1}`);

// Labelled in the language it leads to and not translated: someone who cannot
// read this page still recognises the name of their own language. Deliberately
// a local copy of the same ten lines on /ranks -- two instances is not yet a
// pattern worth abstracting, and the alternative is editing the flagship page
// to serve this one.
const OtherLanguage = () => {
  const { pathname } = useLocation();
  return pathname === "/ua/rank-points" ? (
    <Link className="rank-points__lang" to="/rank-points" lang="en">
      Read in English
    </Link>
  ) : (
    <Link className="rank-points__lang" to="/ua/rank-points" lang="uk">
      Читати українською
    </Link>
  );
};

// `snapshot` is the reading the daily census job commits, and it is the initial
// state rather than a fallback. Two readers get numbers because of it: a
// build-time render, which is all a crawler ever sees, and a visitor who
// arrives while the free API instance is still cold-starting.
const RankPoints = ({ t, load = getRankDistribution, days = 7, snapshot = CENSUS_SNAPSHOT }) => {
  const [data, setData] = useState(snapshot ?? null);

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => load(days))
      .then((response) => {
        if (!alive) return;
        const fresh = response?.data ?? null;
        // Two shapes a successful request carries that are worse than what is
        // already on the page: the controller answers its own errors with a 200
        // and a message rather than data, and the first days of a season have no
        // table to cut. Neither may replace a good table -- unless it names a
        // different season, in which case the committed reading is the stale one
        // and has to give way even though it is the fuller one.
        // Compared against `snapshot` rather than against current state, which
        // is what TierDistribution does too: the committed reading is the fixed
        // thing this fetch is trying to improve on, and reading state here would
        // put a stale closure in the dependency list for no gain.
        const movedOn = Boolean(fresh?.seasonId) && fresh.seasonId !== snapshot?.seasonId;
        if (rpTable(snapshot) && !rpTable(fresh) && !movedOn) return;
        setData(fresh);
      })
      .catch(() => {
        // A failed read with a table in hand is not a failure the reader needs
        // to hear about: last week's cuts are a better answer than a line saying
        // the sample is unreachable, and the window printed under them says how
        // old they are.
      });
    return () => {
      alive = false;
    };
  }, [load, days, snapshot]);

  return (
    <div className="content rank-points">
      <div className="rank-points__hero">
        {/* Matches the heading the prerendered shell puts in #root, so the text
            a crawler reads and the text React renders are the same sentence. */}
        <h1>{t("pages.rankPoints.title")}</h1>
        <p>{t("pages.rankPoints.intro")}</p>
        <OtherLanguage />
      </div>

      <RankPointsTable t={t} data={data} />
      <RankPointsLookup t={t} table={rpTable(data)} />

      {SECTIONS.map((section) => (
        <section className="rank-points__section" id={section.key} key={section.key}>
          <h2>{t(`pages.rankPoints.${section.key}.heading`)}</h2>
          {paragraphKeys(section.paragraphs).map((paragraph) => (
            <p key={paragraph}>{t(`pages.rankPoints.${section.key}.${paragraph}`)}</p>
          ))}
        </section>
      ))}

      <p className="rank-points__outro">
        <Link to="/ranks">{t("pages.rankPoints.seeRanks")}</Link>
      </p>
      <p className="rank-points__outro">
        <Link to="/leaderboards">{t("pages.rankPoints.seeLeaderboards")}</Link>
      </p>
    </div>
  );
};

export default translate(RankPoints);
