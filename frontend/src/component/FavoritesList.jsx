import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button, Popconfirm } from "antd";
import {
  CheckOutlined,
  DeleteOutlined,
  HeartOutlined,
  SwapOutlined,
  UserDeleteOutlined,
} from "@ant-design/icons";
import { translate } from "react-switch-lang";
import {
  FAVORITES_UPDATED_EVENT,
  clearFavorites,
  getFavorites,
  removeFavorite,
} from "../cookie/store";
import { getIconComponentPlatfrom, getPlatformAvatar } from "../helpers/other";

const MAX_COMPARE_SLOTS = 3;

const FavoritesList = ({ t }) => {
  const [favoritesList, setFavoritesList] = useState({});
  const [deleteOn, setDeleteOn] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const navigate = useNavigate();

  const loadFavorites = useCallback(async () => {
    const items = await getFavorites();
    setFavoritesList(items || {});
  }, []);

  useEffect(() => {
    loadFavorites();

    const onFavoritesUpdated = () => {
      loadFavorites();
    };

    const onStorageUpdated = (event) => {
      if (event.key === "favorites") {
        loadFavorites();
      }
    };

    window.addEventListener(FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    window.addEventListener("storage", onStorageUpdated);

    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
      window.removeEventListener("storage", onStorageUpdated);
    };
  }, [loadFavorites]);

  const cleanFavorites = async () => {
    await clearFavorites();
    setFavoritesList({});
  };

  const handleRemoveFavorite = async (id) => {
    const result = await removeFavorite(id);
    setFavoritesList(result?.favorites || {});
    setSelectedIds((prev) => prev.filter((selected) => selected !== id));
  };

  const toggleCompareMode = () => {
    setCompareOn((prev) => !prev);
    setDeleteOn(false);
    setSelectedIds([]);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((selected) => selected !== id);
      if (prev.length >= MAX_COMPARE_SLOTS) return prev;
      return [...prev, id];
    });
  };

  const startCompare = () => {
    const lookup = favoritesList || {};
    const params = new URLSearchParams();
    selectedIds.slice(0, MAX_COMPARE_SLOTS).forEach((id, index) => {
      const item = lookup[id];
      if (!item) return;
      const playerId = item.gameId || item.accountId || item.id;
      const platform = item.platform || "steam";
      params.set(`p${index + 1}`, `${platform}:${playerId}`);
    });
    if ([...params.keys()].length >= 2) {
      navigate(`/compare?${params.toString()}`);
    }
  };

  const entries = Object.values(favoritesList || {}).sort((a, b) => (b?.addedAt || 0) - (a?.addedAt || 0));

  if (!entries.length) {
    return (
      <div className="can-add-favoritelist">
        {t("other.words.noFavorites")}
      </div>
    );
  }

  const text = t("other.words.cleanListConfirm");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="favorites-list">
        <div className="playerpage-buttons">
          <Button
            type="link"
            icon={<UserDeleteOutlined />}
            size="small"
            className={deleteOn ? "active" : ""}
            onClick={() => {
              setDeleteOn(!deleteOn);
              setCompareOn(false);
              setSelectedIds([]);
            }}
          >
            {t("other.words.deletePlayer")}
          </Button>
          <Button
            type="link"
            icon={<SwapOutlined />}
            size="small"
            className={compareOn ? "active" : ""}
            onClick={toggleCompareMode}
          >
            {t("other.words.compareMode")}
          </Button>
          {compareOn && selectedIds.length >= 2 ? (
            <Button
              type="primary"
              size="small"
              onClick={startCompare}
            >
              {t("other.words.compareGo", { count: selectedIds.length })}
            </Button>
          ) : null}
          <Popconfirm
            placement="bottomRight"
            title={text}
            onConfirm={cleanFavorites}
            okText="Yes"
            cancelText="No"
            className="pubg-pop"
          >
            <Button type='link' icon={<DeleteOutlined />} size="small">
              {t("other.words.cleanList")}
            </Button>
          </Popconfirm>
        </div>

        <div className="favorites-list__grid">
          {entries.map((item, index) => {
            const playerId = item?.gameId || item?.accountId || item?.id;
            const playerNickname = item?.nickname || playerId || "Unknown";
            const playerPlatform = item?.platform || "steam";
            const displayPlatform = playerPlatform === "xbl" ? "xbox" : playerPlatform;
            const avatar = item?.avatarUrl || getPlatformAvatar(playerPlatform);

            const isSelected = selectedIds.includes(item.id);
            const reachedSelectionCap =
              !isSelected && selectedIds.length >= MAX_COMPARE_SLOTS;

            const cardBody = (
              <>
                <img
                  src={avatar || "/images/steam_avatar.jpg"}
                  alt={playerNickname}
                  className="favorite-card__avatar"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/images/steam_avatar.jpg";
                  }}
                />
                <div className="favorite-card__meta">
                  <div className="favorite-card__name">{playerNickname}</div>
                  <div className="favorite-card__sub">
                    <span className="favorite-card__platform">{getIconComponentPlatfrom(playerPlatform)}</span>
                    <span>{displayPlatform.toUpperCase()}</span>
                  </div>
                </div>
                <div className="favorite-card__link">
                  {compareOn
                    ? isSelected
                      ? t("other.words.selected")
                      : t("other.words.select")
                    : t("other.words.viewStats")}
                </div>
              </>
            );

            return (
              <motion.article
                className={`favorite-card ${isSelected ? "favorite-card--selected" : ""} ${
                  reachedSelectionCap ? "favorite-card--disabled" : ""
                }`}
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
              >
                {compareOn ? (
                  <button
                    type="button"
                    className="favorite-card__main favorite-card__main--button"
                    onClick={() => toggleSelect(item.id)}
                    disabled={reachedSelectionCap}
                  >
                    {cardBody}
                  </button>
                ) : (
                  <Link to={`/player/${playerPlatform}/${playerId}`} className="favorite-card__main">
                    {cardBody}
                  </Link>
                )}

                {compareOn ? (
                  <div className={`favorite-card__select ${isSelected ? "is-selected" : ""}`}>
                    {isSelected ? <CheckOutlined /> : null}
                  </div>
                ) : deleteOn ? (
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    className="favorite-card__remove"
                    onClick={() => handleRemoveFavorite(item.id)}
                  />
                ) : (
                  <div className="favorite-card__mark">
                    <HeartOutlined />
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default translate(FavoritesList);
