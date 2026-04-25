import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { translate } from "react-switch-lang";
import { getPlayerData } from "../api/player";
import { resolvePreferredPlayerName } from "../helpers/playerIdentity";

const REFRESH_DEFAULT_SEC = 60;
const REFRESH_MIN_SEC = 30;

const getStat = (stats, key, fallback = "0") => stats?.[key]?.displayValue || fallback;

const placementTier = (placement) => {
  const p = Number(placement);
  if (!Number.isFinite(p) || p <= 0) return "na";
  if (p === 1) return "win";
  if (p <= 10) return "top10";
  if (p <= 25) return "top25";
  return "rest";
};

const Overlay = ({ t }) => {
  const { platform, gameId } = useParams();
  const [searchParams] = useSearchParams();

  const refreshSec = Math.max(
    REFRESH_MIN_SEC,
    Number(searchParams.get("refresh")) || REFRESH_DEFAULT_SEC
  );
  const bgMode = searchParams.get("bg") || "dark";
  const accent = searchParams.get("accent") || null;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await getPlayerData(platform, gameId, null);
      const payload = response?.data?.data || response?.data || null;
      if (payload && payload.platformInfo) {
        setData(payload);
        setError(null);
      } else {
        setError(t("pages.overlay.errorNoPlayer"));
      }
    } catch (err) {
      setError(err?.message || t("pages.overlay.errorGeneric"));
    }
  }, [platform, gameId, t]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, refreshSec * 1000);
    return () => clearInterval(id);
  }, [fetchData, refreshSec]);

  const stats = data?.segments?.[0]?.stats || {};
  const season = data?.season || null;
  const rankedInfo = season?.rankedInfo || null;
  const platformInfo = data?.platformInfo || {};
  const nickname = resolvePreferredPlayerName(platformInfo.platformUserHandle, gameId) || gameId;
  const rankBadge = rankedInfo?.iconUrl || rankedInfo?.iconFallbackUrl || "/images/ranks/opgg/unranked.png";
  const rankLabel = rankedInfo?.label || "Unranked";
  const rp = Number(rankedInfo?.currentRankPoint);
  const matchItems = Array.isArray(data?.matches?.items) ? data.matches.items : [];
  const recentPlacements = matchItems
    .slice(0, 8)
    .map((match) => ({ id: match.id, tier: placementTier(match.placement), placement: match.placement }));

  const cardStyle = accent ? { "--overlay-accent": `#${accent.replace(/^#/, "")}` } : undefined;

  return (
    <div className={`overlay-page overlay-page--${bgMode}`}>
      <div className={`overlay-card overlay-card--${bgMode}`} style={cardStyle}>
        {error && !data ? (
          <div className="overlay-card__error">{error}</div>
        ) : !data ? (
          <div className="overlay-card__loading">{t("pages.overlay.loading")}</div>
        ) : (
          <>
            <div className="overlay-card__head">
              <img
                src={rankBadge}
                alt={rankLabel}
                className="overlay-card__rank"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/images/ranks/opgg/unranked.png";
                }}
              />
              <div className="overlay-card__identity">
                <strong>{nickname}</strong>
                <span>{rankLabel}{Number.isFinite(rp) ? ` - ${rp.toLocaleString()} RP` : ""}</span>
              </div>
              <div className="overlay-card__brand">PUBG TRACKER</div>
            </div>

            <div className="overlay-card__stats">
              <div className="overlay-stat">
                <span>{t("pages.overlay.statKd")}</span>
                <strong>{getStat(stats, "kd", "0")}</strong>
              </div>
              <div className="overlay-stat">
                <span>{t("pages.overlay.statWin")}</span>
                <strong>{getStat(stats, "wlPercentage", "0%")}</strong>
              </div>
              <div className="overlay-stat">
                <span>{t("pages.overlay.statAvgDmg")}</span>
                <strong>{getStat(stats, "avgDamage", "0")}</strong>
              </div>
              <div className="overlay-stat">
                <span>{t("pages.overlay.statMatches")}</span>
                <strong>{getStat(stats, "matchesPlayed", "0")}</strong>
              </div>
            </div>

            {recentPlacements.length ? (
              <div className="overlay-card__recent">
                <span>{t("pages.overlay.lastMatches")}</span>
                <div className="overlay-card__dots">
                  {recentPlacements.map((item) => (
                    <i
                      key={item.id}
                      className={`overlay-dot overlay-dot--${item.tier}`}
                      title={`#${item.placement}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default translate(Overlay);
