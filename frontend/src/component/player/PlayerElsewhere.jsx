import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLanguage, translate } from "react-switch-lang";
import { locatePlayer } from "../../api/player";
import { trackEvent } from "../../helpers/analytics";
import { normalizePlatform } from "../../helpers/playerIdentity";
import { pluralUa } from "../../helpers/pluralUa";

const PLATFORM_NAMES = {
  steam: "Steam",
  psn: "PlayStation",
  xbox: "Xbox",
  kakao: "Kakao",
};

// Seventeen digits cannot be a PUBG name, which holds sixteen characters at most.
const STEAM_ID = /^7656119\d{10}$/;
// PUBG MOBILE ids are bare numbers of this length; a PUBG name can be digits
// too, so this only adds an explanation and the lookup still runs.
const MOBILE_ID = /^\d{9,12}$/;

const usableHits = (list) =>
  (Array.isArray(list) ? list : []).filter(
    (hit) => PLATFORM_NAMES[hit?.platform] && typeof hit?.name === "string" && hit.name
  );

const RecentMatches = ({ count, t }) => {
  if (count === null || count === undefined) return null;
  if (count === 0) return <span className="player-elsewhere__matches">{t("pages.playerError.elsewhere.noRecentMatches")}</span>;
  const forms = t("pages.playerError.elsewhere.matchWords").split("|");
  const word = getLanguage() === "ua" ? pluralUa(count, forms) : forms[count === 1 ? 0 : 1];
  return (
    <span className="player-elsewhere__matches">
      {t("pages.playerError.elsewhere.recentMatches", { count, matches: word })}
    </span>
  );
};

const PlayerElsewhere = ({ platform, gameId, t }) => {
  const steamId = STEAM_ID.test(String(gameId || "").trim());
  const mobileId = MOBILE_ID.test(String(gameId || "").trim());
  const [state, setState] = useState({ status: "checking", found: [], suggestions: [] });

  useEffect(() => {
    const report = (result) =>
      trackEvent("player_elsewhere", { platform: normalizePlatform(platform), result });

    if (steamId) {
      report("steam_id");
      return undefined;
    }

    let active = true;
    setState({ status: "checking", found: [], suggestions: [] });

    Promise.resolve()
      .then(() => locatePlayer(platform, gameId))
      .then((response) => {
        if (!active) return;
        const data = response?.data;
        const found = usableHits(data?.found);
        const suggestions = usableHits(data?.suggestions);
        if (found.length || suggestions.length) {
          setState({ status: "result", found, suggestions });
          report(found.length ? "found" : "suggested");
        } else if (data?.complete === true) {
          setState({ status: "none", found: [], suggestions: [] });
          report("none");
        } else {
          setState({ status: "unknown", found: [], suggestions: [] });
        }
      })
      .catch(() => {
        if (active) setState({ status: "unknown", found: [], suggestions: [] });
      });

    return () => {
      active = false;
    };
  }, [platform, gameId, steamId]);

  if (steamId) {
    return (
      <p className="player-elsewhere player-elsewhere--hint" role="status">
        {t("pages.playerError.elsewhere.steamId")}
      </p>
    );
  }

  const hint = mobileId ? (
    <p className="player-elsewhere player-elsewhere--hint">{t("pages.playerError.elsewhere.mobileId")}</p>
  ) : null;

  if (state.status === "unknown") return hint;

  if (state.status === "checking" || state.status === "none") {
    return (
      <>
        {hint}
        <p className={`player-elsewhere player-elsewhere--${state.status}`} role="status">
          {t(`pages.playerError.elsewhere.${state.status}`)}
        </p>
      </>
    );
  }

  return (
    <>
      {hint}
      <div className="player-elsewhere" role="status">
        {state.suggestions.length ? (
          <div className="player-elsewhere__suggestions">
            <p className="player-elsewhere__lead">{t("pages.playerError.elsewhere.suggested")}</p>
            <ul className="player-elsewhere__list">
              {state.suggestions.map((hit) => (
                <li key={`${hit.platform}:${hit.name}`}>
                  <Link to={`/player/${hit.platform}/${encodeURIComponent(hit.name)}`}>{hit.name}</Link> <RecentMatches count={hit.matches} t={t} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {state.found.map((hit) => (
          <p key={hit.platform} className="player-elsewhere__hit">
            {t("pages.playerError.elsewhere.found", { platform: PLATFORM_NAMES[hit.platform] })}{" "}
            <Link to={`/player/${hit.platform}/${encodeURIComponent(hit.name)}`}>{hit.name}</Link> <RecentMatches count={hit.matches} t={t} />
          </p>
        ))}
      </div>
    </>
  );
};

export default translate(PlayerElsewhere);
