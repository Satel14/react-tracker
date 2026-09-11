import React, { useEffect, useState } from "react";
import { getLanguage } from "react-switch-lang";
import { getRankDistribution } from "../../api/census";
import { RANK_LADDER } from "../../helpers/rankLadder";
import CensusChartDownload from "./CensusChartDownload";
import { canExportCensusChart } from "../../helpers/censusChart";
import {
  CENSUS_SNAPSHOT,
  UNRANKED,
  effectiveReadings,
  hasLadderReading,
  usableSnapshot,
} from "../../helpers/censusSnapshot";
import {
  CENSUS_DATA_URL,
  CENSUS_CSV_URL,
  CENSUS_DATA_PUBLISHED,
} from "../../helpers/censusDataFiles";

// The unranked bucket -- players with no ranked record who turned up in a
// ranked lobby -- is kept as its own row rather than dropped: removing them
// would quietly shrink the denominator every other share is measured against.
const ROWS = [...RANK_LADDER.map((tier) => tier.key), UNRANKED];

// "division.bro.official.pc-2018-42" -> "42". The dictionaries supply the word
// around it so the sentence reads as Ukrainian in Ukrainian.
const seasonNumber = (seasonId) =>
  (typeof seasonId === "string" && seasonId.match(/(\d+)\s*$/)?.[1]) || "";

const groupDigits = (value) =>
  new Intl.NumberFormat(getLanguage() === "ua" ? "uk-UA" : "en-US").format(Number(value) || 0);

// The eight tier names are proper nouns the game prints in English in both
// locales -- the Ukrainian ladder copy says "Master" too -- so they are derived
// from the ladder rather than translated twice.
const tierName = (key) => key.charAt(0).toUpperCase() + key.slice(1);

const percent = (share) => `${(share * 100).toFixed(1)}%`;

// Half the interval's width, in percentage points -- the "give or take" a
// reader expects, rather than two bounds they have to subtract themselves.
const margin = ({ low, high }) => (((high - low) / 2) * 100).toFixed(1);

// Only the shard the census is drawn from has a label. A second one would be
// copy for a measurement that does not exist -- the collector pins
// shard = "steam" -- so an unexpected shard prints its own name rather than a
// translation nobody wrote.
const platformLabel = (t, shard) =>
  shard === "steam" ? t("pages.ranks.distribution.platform") : shard || "";

// `snapshot` is the reading committed to the repo by the daily census job, and
// it is the initial state rather than a fallback. Two readers get numbers
// because of it: a build-time render, which is all a crawler or an answer
// engine ever sees, and a visitor who arrives while the free API instance is
// still cold-starting. The live fetch then overwrites it.
const TierDistribution = ({
  t,
  load = getRankDistribution,
  days = 7,
  snapshot = CENSUS_SNAPSHOT,
}) => {
  const [state, setState] = useState(
    snapshot ? { status: "ready", data: snapshot } : { status: "loading" },
  );

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => load(days))
      .then((response) => {
        if (!alive) return;
        const fresh = response?.data ?? null;
        // Two shapes a successful request can carry that are worse than what is
        // already on the page: the controller answers its own errors with a 200
        // and a message instead of data, and the first days of a season come
        // back with no tier thick enough to publish. Neither may overwrite a
        // good table -- unless it names a different season, in which case the
        // committed reading is the stale one and has to give way.
        const movedOn = Boolean(fresh?.seasonId) && fresh.seasonId !== snapshot?.seasonId;
        if (snapshot && !usableSnapshot(fresh) && !movedOn) return;
        setState({ status: "ready", data: fresh });
      })
      .catch(() => {
        // A failed read with a snapshot in hand is not a failure the reader
        // needs to hear about: last week's shares are a better answer than a
        // line saying the sample is unreachable, and the window printed under
        // them says how old they are.
        if (alive && !snapshot) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [load, days, snapshot]);

  if (state.status === "loading") {
    return <p className="ranks-page__share-note">{t("pages.ranks.distribution.loading")}</p>;
  }

  if (state.status === "error") {
    return <p className="ranks-page__share-note">{t("pages.ranks.distribution.unavailable")}</p>;
  }

  const fresh = state.data ?? {};
  const gathering = !hasLadderReading(fresh);
  const archived = gathering && canExportCensusChart(snapshot) && snapshot.seasonId !== fresh.seasonId;
  // Keep the historical chart visible while the new season is being sampled.
  // Its own season, dates and historical label travel with both the HTML and export.
  const data = archived ? { ...snapshot, current: false } : fresh;

  // Every season rollover passes through here. Naming the season is what makes
  // the empty section read as a calendar event rather than as a broken page.
  //
  // A reading whose only publishable row is the unranked bucket lands here
  // too. That is what the first sample of a new season looks like -- nobody
  // has placed, so 100% of it is unplaced -- and drawing it as a full-width
  // bar would answer "where do players sit on the ladder" with a row that is
  // not on the ladder.
  if (!hasLadderReading(data)) {
    return (
      <p className="ranks-page__share-note">
        {t("pages.ranks.distribution.gathering", { season: seasonNumber(data.seasonId) })}
      </p>
    );
  }

  // Off the widest upper bound, not off the widest share. Scaled off the share,
  // the top tier's bar fills the track and its interval is clipped away by the
  // end of it -- drawing the least certain tier as the most certain one.
  const measured = new Map((data.tiers ?? []).map((row) => [row.tier, row]));
  const publishable = (data.tiers ?? []).filter((row) => row.publishable);
  const widest = Math.max(...publishable.map((row) => row.high));
  const effective = effectiveReadings(data);

  return (
    <figure className="ranks-page__shares">
      <figcaption className="ranks-page__share-caption">
        <h3>{t("pages.ranks.distribution.chart.season", { season: seasonNumber(data.seasonId) })}</h3>
        {data.current === false && (
          <span>{t("pages.ranks.distribution.chart.historical")}</span>
        )}
      </figcaption>
      {archived && (
        <p className="ranks-page__share-stale">
          {t("pages.ranks.distribution.gathering", { season: seasonNumber(fresh.seasonId) })}
        </p>
      )}
      {!archived && data.current === false && (
        <p className="ranks-page__share-stale">
          {t("pages.ranks.distribution.finished", { season: seasonNumber(data.seasonId) })}
        </p>
      )}
      <ol className="ranks-page__share-list">
        {ROWS.map((key) => {
          const ladder = RANK_LADDER.find((tier) => tier.key === key);
          const row = measured.get(key);
          const known = Boolean(row?.publishable);

          return (
            <li
              className={`ranks-page__share ranks-page__tier--${key}`}
              data-tier={key}
              key={key}
            >
              {ladder ? (
                <img
                  className="ranks-page__share-icon"
                  src={ladder.iconUrl}
                  alt=""
                  width="28"
                  height="28"
                  loading="lazy"
                  aria-hidden="true"
                />
              ) : (
                <span className="ranks-page__share-icon" aria-hidden="true" />
              )}

              <span className="ranks-page__share-name">
                {ladder ? tierName(key) : t("pages.ranks.distribution.unranked")}
              </span>

              {known && (
                <span className="ranks-page__share-bar" aria-hidden="true">
                  <span
                    className="ranks-page__share-range"
                    style={{
                      left: `${(row.low / widest) * 100}%`,
                      width: `${((row.high - row.low) / widest) * 100}%`,
                    }}
                  />
                  <span
                    className="ranks-page__share-fill"
                    style={{ width: `${(row.share / widest) * 100}%` }}
                  />
                </span>
              )}

              {known ? (
                <>
                  <b className="ranks-page__share-value">{percent(row.share)}</b>
                  <span className="ranks-page__share-margin">±{margin(row)}</span>
                </>
              ) : (
                <span className="ranks-page__share-thin">
                  {t("pages.ranks.distribution.tooFew")}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="ranks-page__share-note">
        {t("pages.ranks.distribution.sample", {
          accounts: groupDigits(data.accounts),
          matches: groupDigits(data.matches),
          platform: platformLabel(t, data.shard),
          from: data.firstDate,
          to: data.lastDate,
        })}{" "}
        {effective
          ? t("pages.ranks.distribution.clustering", { effective: groupDigits(effective) })
          : null}
      </p>

      <CensusChartDownload data={data} t={t} />

      {/* The one asset here nobody else publishes, as something a post or a
          wiki page can point at rather than screenshot. Written by the build
          from the same snapshot this table renders, so the file and the page
          cannot disagree. */}
      {CENSUS_DATA_PUBLISHED && (
        <p className="ranks-page__share-note">
          {t("pages.ranks.distribution.download")}{" "}
          <a href={CENSUS_DATA_URL}>JSON</a>
          {" · "}
          <a href={CENSUS_CSV_URL}>CSV</a>
        </p>
      )}
    </figure>
  );
};

export default TierDistribution;
