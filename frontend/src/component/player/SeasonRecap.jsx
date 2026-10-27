import React, { useEffect, useState } from "react";
import { getLanguage, translate } from "react-switch-lang";
import { getRankDistribution } from "../../api/census";
import { trackEvent } from "../../helpers/analytics";
import { rpPercentile } from "../../helpers/rankPercentile";
import { previousSeason, seasonRecap } from "../../helpers/seasonRecap";
import { recapFigures } from "../../helpers/seasonRecapCard";

const OUT_OF = 100;

const SeasonRecap = ({ t, season, seasons, playerName, platform, onOpenSeason, loadDistribution = getRankDistribution }) => {
  const recap = seasonRecap(season);
  const previous = season?.isCurrentSeason ? previousSeason(season.id, seasons) : null;
  const [percentile, setPercentile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const seasonId = recap?.seasonId || null;
  const rankPoint = recap?.rankPoint ?? null;

  // The same measurement the header's line makes, and with the same rule: a
  // standing only counts against a census of the season it belongs to.
  useEffect(() => {
    setPercentile(null);
    if (!seasonId || rankPoint === null) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => loadDistribution(7))
      .then((response) => {
        const data = response?.data;
        if (!alive || !data || data.seasonId !== seasonId) return;
        const at = rpPercentile(rankPoint, data.rpPercentiles);
        setPercentile(at === null ? null : OUT_OF - at);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [seasonId, rankPoint, loadDistribution]);

  if (!recap && !previous) return null;

  const language = getLanguage();
  const label = (key, values) => t(`pages.player.recap.${key}`, values);

  const download = async () => {
    if (busy || !recap) return;
    setBusy(true);
    setFailed(false);
    try {
      const { downloadSeasonRecap } = await import("../../helpers/downloadSeasonRecap");
      await downloadSeasonRecap(recap, { t, language, playerName, platform, percentile });
      trackEvent("season_recap_download", { season: recap.season });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const previousLink = previous ? (
    <button type="button" className="season-recap__previous" onClick={() => onOpenSeason(previous.id)}>
      {label("previous", { season: previous.seasonNumber })}
    </button>
  ) : null;

  if (!recap) {
    return <div className="season-recap season-recap--link-only">{previousLink}</div>;
  }

  const title = label(recap.finished ? "titleFinal" : "titleSoFar", { season: recap.season });
  const figures = recapFigures(recap, { language });

  return (
    <section className={`player-card season-recap season-recap--${recap.tier || "unranked"}`}>
      <div className="player-card__head">
        <h3>{title}</h3>
        {previousLink}
      </div>

      <div className="season-recap__rank">
        <strong className="season-recap__tier">{recap.tierLabel}</strong>
        <span className="season-recap__rp">{`${figures.rankPoint} RP`}</span>
        {figures.peakRankPoint ? (
          <span className="season-recap__peak">{label("peak", { rp: figures.peakRankPoint })}</span>
        ) : null}
      </div>
      {percentile !== null ? (
        <p className="season-recap__percentile">{t("pages.player.percentile.line", { n: percentile })}</p>
      ) : null}

      <ul className="season-recap__stats" aria-label={title}>
        {figures.tiles.map(([key, value]) => (
          <li key={key}>
            <span className="season-recap__label">{label(key)}</span>
            <strong className="season-recap__value">{value}</strong>
          </li>
        ))}
      </ul>

      {figures.records.length ? (
        <p className="season-recap__records">
          {`${label("records")}: ${figures.records.map(([key, value]) => `${label(key)} ${value}`).join(" · ")}`}
        </p>
      ) : null}

      <div className="season-recap__actions">
        <button type="button" className="season-recap__download" onClick={download} disabled={busy}>
          {busy ? label("downloading") : label("download")}
        </button>
        {failed ? <p className="season-recap__error" role="alert">{label("error")}</p> : null}
      </div>
    </section>
  );
};

export default translate(SeasonRecap);
