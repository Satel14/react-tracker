import React, { useEffect, useState } from "react";
import { getLanguage } from "react-switch-lang";
import { getRankDistribution } from "../../api/census";
import { RANK_LADDER } from "../../helpers/rankLadder";

// Players with no ranked record who turned up in a ranked lobby. Kept as its
// own row rather than dropped: removing them would quietly shrink the
// denominator every other share is measured against.
const UNRANKED = "unranked";

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

const TierDistribution = ({ t, load = getRankDistribution, days = 7 }) => {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => load(days))
      .then((response) => {
        if (alive) setState({ status: "ready", data: response?.data ?? null });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [load, days]);

  if (state.status === "loading") {
    return <p className="ranks-page__share-note">{t("pages.ranks.distribution.loading")}</p>;
  }

  if (state.status === "error") {
    return <p className="ranks-page__share-note">{t("pages.ranks.distribution.unavailable")}</p>;
  }

  const data = state.data ?? {};
  const measured = new Map((data.tiers ?? []).map((row) => [row.tier, row]));
  const publishable = (data.tiers ?? []).filter((row) => row.publishable);

  // Every season rollover passes through here. Naming the season is what makes
  // the empty section read as a calendar event rather than as a broken page.
  if (!publishable.length) {
    return (
      <p className="ranks-page__share-note">
        {t("pages.ranks.distribution.gathering", { season: seasonNumber(data.seasonId) })}
      </p>
    );
  }

  // Off the widest upper bound, not off the widest share. Scaled off the share,
  // the top tier's bar fills the track and its interval is clipped away by the
  // end of it -- drawing the least certain tier as the most certain one.
  const widest = Math.max(...publishable.map((row) => row.high));

  return (
    <div className="ranks-page__shares">
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
          from: data.firstDate,
          to: data.lastDate,
        })}
      </p>
    </div>
  );
};

export default TierDistribution;
