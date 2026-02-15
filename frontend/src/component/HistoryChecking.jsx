import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";
import { getRecentSearches } from "../api/player";
import { getHistory, HISTORY_UPDATED_EVENT } from "../cookie/store";
import { getIconComponentPlatfrom, getPlatformAvatar } from "../helpers/other";

const EMPTY_LIST = [];

const isAccountIdentifier = (value) =>
  typeof value === "string" && /^account\./i.test(value.trim());

const stripPlatformPrefix = (value, platform) => {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  const prefix = `${String(platform || "steam").toLowerCase()}:`;
  if (raw.toLowerCase().startsWith(prefix)) {
    return raw.slice(prefix.length);
  }

  return raw;
};

const normalizeDisplayName = (nickname, gameId, platform) => {
  const normalizedGameId = stripPlatformPrefix(String(gameId || "").trim(), platform);
  const normalizedNickname = stripPlatformPrefix(String(nickname || "").trim(), platform);

  if (normalizedNickname && !(isAccountIdentifier(normalizedNickname) && !isAccountIdentifier(normalizedGameId))) {
    return normalizedNickname;
  }

  return normalizedGameId || "Unknown";
};

const normalizeHistoryEntries = (historyMap = {}) => {
  return Object.entries(historyMap || {})
    .map(([entryKey, player]) => {
      const rawKey = String(entryKey || "");
      const delimiterIndex = rawKey.indexOf(":");
      const platformFromKey = delimiterIndex >= 0 ? rawKey.slice(0, delimiterIndex) : "";
      const gameIdFromKey = delimiterIndex >= 0 ? rawKey.slice(delimiterIndex + 1) : rawKey;
      const platform = player?.platform || platformFromKey || "steam";
      const gameId = stripPlatformPrefix(player?.gameId || gameIdFromKey || entryKey, platform);
      const nickname = normalizeDisplayName(player?.nickname, gameId, platform);
      const avatar = player?.avatar || getPlatformAvatar(platform);

      if (!gameId) return null;

      return {
        id: `${platform}:${gameId}`,
        platform,
        gameId,
        nickname,
        avatar,
        rating: player?.rating ?? null,
        searchedAt: Number(player?.searchedAt || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.searchedAt || 0) - (a?.searchedAt || 0));
};

const normalizeRecentEntries = (items = []) => {
  if (!Array.isArray(items)) return EMPTY_LIST;

  return items
    .map((item) => {
      const platform = item?.platform || "steam";
      const gameId = stripPlatformPrefix(item?.gameId || "", platform);
      const nickname = normalizeDisplayName(item?.nickname, gameId, platform);
      const avatar = item?.avatar || getPlatformAvatar(platform);
      if (!gameId) return null;

      return {
        id: item?.id || `${platform}:${gameId}`,
        platform,
        gameId,
        nickname,
        avatar,
        rating: item?.rating ?? null,
        searchedAt: Number(item?.searchedAt || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.searchedAt || 0) - (a?.searchedAt || 0));
};

const HistoryChecking = ({ t }) => {
  const [historyList, setHistoryList] = useState(EMPTY_LIST);
  const [recentList, setRecentList] = useState(EMPTY_LIST);

  const loadHistory = useCallback(async () => {
    const items = await getHistory();
    setHistoryList(normalizeHistoryEntries(items || {}));
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const response = await getRecentSearches();
      const payload = response?.data?.data || response?.data || [];
      setRecentList(normalizeRecentEntries(payload));
    } catch (_e) {
      setRecentList(EMPTY_LIST);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadRecent();

    const onHistoryUpdated = () => {
      loadHistory();
    };

    const onStorageUpdated = (event) => {
      if (event.key === "history") {
        loadHistory();
      }
    };

    window.addEventListener(HISTORY_UPDATED_EVENT, onHistoryUpdated);
    window.addEventListener("storage", onStorageUpdated);

    return () => {
      window.removeEventListener(HISTORY_UPDATED_EVENT, onHistoryUpdated);
      window.removeEventListener("storage", onStorageUpdated);
    };
  }, [loadHistory, loadRecent]);

  if (!historyList.length && !recentList.length) {
    return <></>;
  }

  const renderHistoryBlocks = (items) => {
    if (!items.length) {
      return (
        <div className="historycheck_block historycheck_block--empty">
          <div className="historycheck_block-left">
            <div className="nickname">
              {t("other.words.notAvailable")}
            </div>
          </div>
        </div>
      );
    }

    return items.map((player) => (
      <Link
        to={`/player/${player.platform}/${player.gameId}`}
        className="historycheck_block"
        key={player.id}
      >
        <div className="historycheck_block-left">
          <img
            alt={player.nickname}
            src={player.avatar || "/images/steam_avatar.jpg"}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/images/steam_avatar.jpg";
            }}
          />
          <div className="nickname">
            {player.nickname}
            <span>{t("other.words.viewStats")}</span>
          </div>
        </div>
        <div className="historycheck_block-platform">
          {getIconComponentPlatfrom(player.platform)}
        </div>
        <div className="historycheck_block-mmr">
          {t("other.words.rating")}
          <span>
            {player.rating ?? ""}
          </span>
        </div>
      </Link>
    ));
  };

  return (
    <>
      <div>
        <motion.div
          className="titlehistory"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {t("other.words.yourHistory")}
        </motion.div>
        <motion.div
          className="historycheck"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {renderHistoryBlocks(historyList)}
        </motion.div>
      </div>

      <div>
        <motion.div
          className="titlehistory"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          {t("other.words.recentSearched")}
        </motion.div>
        <motion.div
          className="historycheck"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          {renderHistoryBlocks(recentList)}
        </motion.div>
      </div>
    </>
  );
};

export default translate(HistoryChecking);
