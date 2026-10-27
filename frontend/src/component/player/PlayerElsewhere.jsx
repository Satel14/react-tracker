import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";
import { locatePlayer } from "../../api/player";
import { trackEvent } from "../../helpers/analytics";
import { normalizePlatform } from "../../helpers/playerIdentity";

const PLATFORM_NAMES = {
  steam: "Steam",
  psn: "PlayStation",
  xbox: "Xbox",
  kakao: "Kakao",
};

const PlayerElsewhere = ({ platform, gameId, t }) => {
  const [state, setState] = useState({ status: "checking", found: [] });

  useEffect(() => {
    let active = true;
    setState({ status: "checking", found: [] });

    const report = (result) =>
      trackEvent("player_elsewhere", { platform: normalizePlatform(platform), result });

    Promise.resolve()
      .then(() => locatePlayer(platform, gameId))
      .then((response) => {
        if (!active) return;
        const data = response?.data;
        const found = (Array.isArray(data?.found) ? data.found : []).filter(
          (hit) => PLATFORM_NAMES[hit?.platform] && typeof hit?.name === "string" && hit.name
        );
        if (found.length) {
          setState({ status: "found", found });
          report("found");
        } else if (data?.complete === true) {
          setState({ status: "none", found: [] });
          report("none");
        } else {
          setState({ status: "unknown", found: [] });
        }
      })
      .catch(() => {
        if (active) setState({ status: "unknown", found: [] });
      });

    return () => {
      active = false;
    };
  }, [platform, gameId]);

  if (state.status === "unknown") return null;

  if (state.status === "checking" || state.status === "none") {
    return (
      <p className={`player-elsewhere player-elsewhere--${state.status}`} role="status">
        {t(`pages.playerError.elsewhere.${state.status}`)}
      </p>
    );
  }

  return (
    <div className="player-elsewhere" role="status">
      {state.found.map((hit) => (
        <p key={hit.platform} className="player-elsewhere__hit">
          {t("pages.playerError.elsewhere.found", { platform: PLATFORM_NAMES[hit.platform] })}{" "}
          <Link to={`/player/${hit.platform}/${encodeURIComponent(hit.name)}`}>{hit.name}</Link>
        </p>
      ))}
    </div>
  );
};

export default translate(PlayerElsewhere);
