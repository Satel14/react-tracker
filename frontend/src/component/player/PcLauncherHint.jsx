import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";
import { checkPcLauncher } from "../../api/player";
import { trackEvent } from "../../helpers/analytics";
import { normalizePlatform } from "../../helpers/playerIdentity";

// Steam and Kakao are one PC account space: the same account answers on both,
// and its matches exist only on the shard the player launches through. So an
// empty Steam profile may belong to a Kakao player, and the other way round.
const OTHER_LAUNCHER = { steam: "kakao", kakao: "steam" };
const LAUNCHER_NAMES = { steam: "Steam", kakao: "Kakao" };
const ACCOUNT_ID = /^account\.[0-9a-f]{32}$/i;

const PcLauncherHint = ({ t, platform, accountId, playerName, hasRecentMatches }) => {
  const searched = normalizePlatform(platform);
  const other = OTHER_LAUNCHER[searched];
  const [found, setFound] = useState(null);

  useEffect(() => {
    setFound(null);
    if (!other || !ACCOUNT_ID.test(String(accountId || "")) || hasRecentMatches) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => checkPcLauncher(searched, accountId))
      .then((response) => {
        if (!alive || response?.data?.platform !== other) return;
        setFound(other);
        trackEvent("player_elsewhere", { platform: searched, result: "other_launcher" });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [searched, other, accountId, hasRecentMatches]);

  if (!found) return null;
  const name = LAUNCHER_NAMES[found];

  return (
    <p className="pc-launcher-hint" role="status">
      {t("pages.player.launcher.text", { platform: name })}{" "}
      <Link to={`/player/${found}/${encodeURIComponent(playerName)}`}>
        {t("pages.player.launcher.link", { platform: name })}
      </Link>
    </p>
  );
};

export default translate(PcLauncherHint);
