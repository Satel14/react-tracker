import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { translate, getLanguage } from "react-switch-lang";
import { getRankDistribution } from "../api/census";
import { CENSUS_SNAPSHOT, benchmarkRows, gatedBenchmarkRows } from "../helpers/censusSnapshot";
import BenchmarkTable from "../component/benchmarks/BenchmarkTable";
import DamageLookup from "../component/benchmarks/DamageLookup";

// Section key -> how many paragraphs it has. Spelled out rather than derived, so
// a translation that loses a paragraph fails the copy guard instead of quietly
// rendering one language shorter than the other.
const SECTIONS = [
  { key: "method", paragraphs: 2 },
  { key: "limits", paragraphs: 5 },
];

const paragraphKeys = (count) => Array.from({ length: count }, (_, i) => `p${i + 1}`);

const groupDigits = (value) =>
  new Intl.NumberFormat(getLanguage() === "ua" ? "uk-UA" : "en-US").format(Number(value) || 0);

// The whole window's account count, quoted in the sample line, is not what the
// benchmark columns rest on -- only accounts whose rows carry the new columns
// are, which in the days right after this ships is a fraction of the window.
// Summed from `damage`, the column every published row is guaranteed to carry
// (benchmarkRows already refused any row missing it), so this never needs a
// row to be asked twice.
const benchmarkSampleSize = (rows) =>
  (rows ?? []).reduce((sum, row) => sum + (Number(row?.metrics?.damage?.n) || 0), 0);

// Only the shard the census is drawn from has a label; the collector pins
// shard = "steam", so anything else prints its own name rather than a
// translation nobody wrote.
const platformLabel = (t, shard) =>
  shard === "steam" ? t("pages.statsByRank.platform") : shard || "";

// The tiers this reading saw but will not publish, named with the number of
// accounts each rests on. Null when nothing was gated, so the caller renders no
// line rather than an empty sentence.
//
// The count is quoted without a counted noun -- "(70 sampled)", "(70 у
// вибірці)" -- on purpose. English needs "1 account" against "70 accounts" and
// Ukrainian needs three forms of its own, and a gated tier is precisely the one
// likeliest to be sitting on a count of one, so the singular would be the
// common case rather than an edge case. A phrase that does not inflect is
// honest in both languages without a plural rule in either.
const gatedNote = (t, gated) => {
  if (!gated.length) return null;

  const entries = gated
    .map((row) =>
      t("pages.statsByRank.gatedEntry", {
        tier: t(`pages.statsByRank.tier.${row.tier}`),
        accounts: groupDigits(row.accounts),
      }),
    )
    .join(", ");

  return `${t("pages.statsByRank.gated")} ${entries}. ${t("pages.statsByRank.gatedRule")}`;
};

// Labelled in the language it leads to and not translated: someone who cannot
// read this page still recognises the name of their own language. Deliberately
// a local copy of the same ten lines on /rank-points and /ranked-lobbies --
// abstracting it would mean editing those pages to serve this one.
const OtherLanguage = () => {
  const { pathname } = useLocation();
  return pathname === "/ua/stats-by-rank" ? (
    <Link className="stats-by-rank__lang" to="/stats-by-rank" lang="en">
      Read in English
    </Link>
  ) : (
    <Link className="stats-by-rank__lang" to="/ua/stats-by-rank" lang="uk">
      Читати українською
    </Link>
  );
};

// `snapshot` is the reading the daily census job commits, and it is the initial
// state rather than a fallback. index.jsx mounts with createRoot, not
// hydrateRoot, so the prerendered markup is thrown away on the first client
// render -- only initial state survives it. Two readers get numbers because of
// that: a build-time render, which is all a crawler ever sees, and a visitor
// who arrives while the free API instance is still cold-starting.
const StatsByRank = ({ t, load = getRankDistribution, days = 7, snapshot = CENSUS_SNAPSHOT }) => {
  // The same signal OtherLanguage uses to pick its own target, reused here
  // rather than a second mechanism: the outro links shipped English-only
  // (commit 804244a) and sent a reader on the Ukrainian twin back to the
  // English /ranks and /ranked-lobbies regardless of which one they were on.
  const { pathname } = useLocation();
  const isUkrainian = pathname === "/ua/stats-by-rank";
  const ranksHref = isUkrainian ? "/ua/ranks" : "/ranks";
  const rankedLobbiesHref = isUkrainian ? "/ua/ranked-lobbies" : "/ranked-lobbies";
  const rankPointsHref = isUkrainian ? "/ua/rank-points" : "/rank-points";
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
        // table thick enough to publish. Neither may replace a good table --
        // unless it names a different season, in which case the committed
        // reading is the stale one and has to give way even though it is the
        // fuller one.
        // Compared against `snapshot` rather than against current state, the
        // way the two neighbouring pages do it: the committed reading is the
        // fixed thing this fetch is trying to improve on, and reading state
        // here would put a stale closure in the dependency list for no gain.
        const movedOn = Boolean(fresh?.seasonId) && fresh.seasonId !== snapshot?.seasonId;
        if (snapshot && !benchmarkRows(fresh) && !movedOn) return;
        setData(fresh);
      })
      .catch(() => {
        // A failed read with a table in hand is not a failure the reader needs
        // to hear about: last week's numbers are a better answer than a line
        // saying the sample is unreachable, and the window printed under them
        // says how old they are.
      });
    return () => {
      alive = false;
    };
  }, [load, days, snapshot]);

  const payload = data ?? {};
  const rows = benchmarkRows(payload);
  const gated = rows ? gatedNote(t, gatedBenchmarkRows(payload)) : null;

  return (
    <div className="content stats-by-rank">
      <div className="stats-by-rank__hero">
        {/* Matches the heading the prerendered shell puts in #root, so the text
            a crawler reads and the text React renders are the same sentence. */}
        <h1>{t("pages.statsByRank.h1")}</h1>
        <p>{t("pages.statsByRank.intro")}</p>
        <OtherLanguage />
      </div>

      {rows ? (
        <>
          {/* Six columns do not fit a phone viewport. The table scrolls inside
              its own box rather than dragging the whole document sideways --
              this page exists for organic search, under mobile-first indexing. */}
          <div className="stats-by-rank__table-wrap">
            <BenchmarkTable t={t} rows={rows} />
          </div>

          {gated && (
            <p className="stats-by-rank__gated-note" data-testid="gated-tiers">
              {gated}
            </p>
          )}

          <p className="stats-by-rank__note">
            {t("pages.statsByRank.sample", {
              accounts: groupDigits(payload.accounts),
              matches: groupDigits(payload.matches),
              platform: platformLabel(t, payload.shard),
              from: payload.firstDate,
              to: payload.lastDate,
            })}{" "}
            {t("pages.statsByRank.tableSample", {
              benchmarkAccounts: groupDigits(benchmarkSampleSize(rows)),
            })}
          </p>

          {/* Only alongside a table. A lookup with nothing to look up against
              cannot answer, and a control that cannot answer is not rendered
              disabled -- it is not rendered. */}
          <DamageLookup t={t} rows={rows} />
        </>
      ) : (
        // No season number here on purpose: this snapshot is by definition the
        // last ARCHIVED season, never the one currently being collected, so
        // there is no correct number to print.
        <p className="stats-by-rank__note">{t("pages.statsByRank.gathering")}</p>
      )}

      {SECTIONS.map((section) => (
        <section className="stats-by-rank__section" id={section.key} key={section.key}>
          <h2>{t(`pages.statsByRank.${section.key}.heading`)}</h2>
          {paragraphKeys(section.paragraphs).map((paragraph) => (
            <p key={paragraph}>{t(`pages.statsByRank.${section.key}.${paragraph}`)}</p>
          ))}
        </section>
      ))}

      <p className="stats-by-rank__outro">
        <Link to={ranksHref}>{t("pages.statsByRank.seeRanks")}</Link>
      </p>
      <p className="stats-by-rank__outro">
        <Link to={rankedLobbiesHref}>{t("pages.statsByRank.seeRankedLobbies")}</Link>
      </p>
      <p className="stats-by-rank__outro">
        <Link to={rankPointsHref}>{t("pages.statsByRank.seeRankPoints")}</Link>
      </p>
    </div>
  );
};

export default translate(StatsByRank);
