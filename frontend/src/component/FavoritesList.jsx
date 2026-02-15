import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button, Popconfirm } from "antd";
import { DeleteOutlined, HeartOutlined, UserDeleteOutlined } from "@ant-design/icons";
import { translate } from "react-switch-lang";
import {
  FAVORITES_UPDATED_EVENT,
  clearFavorites,
  getFavorites,
  removeFavorite,
} from "../cookie/store";
import { getIconComponentPlatfrom, getPlatformAvatar } from "../helpers/other";

const FavoritesList = ({ t }) => {
  const [favoritesList, setFavoritesList] = useState({});
  const [deleteOn, setDeleteOn] = useState(false);

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
            onClick={() => setDeleteOn(!deleteOn)}
          >
            {t("other.words.deletePlayer")}
          </Button>
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
          {entries.map((item) => {
            const playerId = item?.gameId || item?.accountId || item?.id;
            const playerNickname = item?.nickname || playerId || "Unknown";
            const playerPlatform = item?.platform || "steam";
            const displayPlatform = playerPlatform === "xbl" ? "xbox" : playerPlatform;
            const avatar = item?.avatarUrl || getPlatformAvatar(playerPlatform);

            return (
              <article className="favorite-card" key={item.id}>
                <Link to={`/player/${playerPlatform}/${playerId}`} className="favorite-card__main">
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
                  <div className="favorite-card__link">{t("other.words.viewStats")}</div>
                </Link>

                {deleteOn ? (
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
              </article>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default translate(FavoritesList);
