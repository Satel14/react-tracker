// Where this player sits, measured against the tier census.
//
// The census stores one rank point per account per day and the endpoint ships
// the RP standing at each whole percentile, so placing a visitor is a lookup
// rather than a query of their own -- and the same cached response serves every
// player page.
//
// It renders nothing rather than something vague. No sample, a sample too thin
// to cut, a census about a different season, or a player with no ranked
// reading all end the same way: no line at all.

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLanguage } from "react-switch-lang";
import { getRankDistribution } from "../../api/census";
import { rpPercentile } from "../../helpers/rankPercentile";

// Below halfway the same measurement reads better from the other end. "Top
// 78%" is a strange thing to tell somebody, and "ahead of 22%" is no less true.
const FLIP_AT = 50;

const groupDigits = (value) =>
  new Intl.NumberFormat(getLanguage() === "ua" ? "uk-UA" : "en-US").format(Number(value) || 0);

const RankPercentile = ({ t, rankPoint, seasonId, load = getRankDistribution, days = 7 }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => load(days))
      .then((response) => {
        if (alive) setData(response?.data ?? null);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [load, days]);

  if (!data) return null;

  // A standing has to be measured against the ladder it belongs to. After a
  // reset the census serves the previous season for days, and the page can be
  // showing any season at all.
  if (!seasonId || data.seasonId !== seasonId) return null;

  const at = rpPercentile(rankPoint, data.rpPercentiles);
  if (at === null) return null;

  const key = at <= FLIP_AT ? "top" : "ahead";
  const percent = at <= FLIP_AT ? at : 100 - at;

  // The visible line answers the one question the reader arrived with. How
  // the number was arrived at is real and has to be reachable -- but in the
  // same sentence it buried the answer, so it lives on the hover and on the
  // page the link already points at.
  const detail = t("pages.player.percentile.detail", {
    accounts: groupDigits(data.accounts),
    days: data.days ?? days,
  });

  return (
    <p className="player-rank-percentile">
      <Link to="/ranks#distribution" title={detail}>
        {t(`pages.player.percentile.${key}`, { percent })}
      </Link>
    </p>
  );
};

export default RankPercentile;
