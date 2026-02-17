import { normalizePlatform } from "../helpers/playerIdentity";

const HISTORY_KEY = "history";
const FAVORITES_KEY = "favorites";
const MAX_HISTORY_ITEMS = 5;
const MAX_FAVORITES_ITEMS = 50;
export const HISTORY_UPDATED_EVENT = "history:updated";
export const FAVORITES_UPDATED_EVENT = "favorites:updated";

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage || null;
}

function safeParseObject(raw) {
  if (typeof raw !== "string" || !raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function readObject(key) {
  const storage = getLocalStorage();
  if (!storage) return {};
  return safeParseObject(storage.getItem(key));
}

function writeObject(key, value) {
  const storage = getLocalStorage();
  if (!storage) return null;
  storage.setItem(key, JSON.stringify(value));
  return value;
}

function emitFavoritesUpdated(favorites) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(FAVORITES_UPDATED_EVENT, {
      detail: {
        count: Object.keys(favorites || {}).length,
        favorites: favorites || {},
      },
    })
  );
}

function emitHistoryUpdated(history) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(HISTORY_UPDATED_EVENT, {
      detail: {
        count: Object.keys(history || {}).length,
        history: history || {},
      },
    })
  );
}

function getHistoryEntryId(platform, gameid) {
  const id = String(gameid || "").trim();
  if (!id) return null;
  return `${normalizePlatform(platform)}:${id}`;
}

function normalizeFavorite(payload = {}) {
  const id = String(payload.accountId || payload.gameId || payload.id || "").trim();
  if (!id) return null;

  const gameId = String(payload.gameId || payload.accountId || payload.id || "").trim() || id;
  const nickname = String(payload.nickname || payload.playerName || gameId || id).trim() || id;
  const platform = String(payload.platform || "steam").trim() || "steam";

  return {
    id,
    gameId,
    accountId: payload.accountId ? String(payload.accountId).trim() : null,
    nickname,
    platform,
    avatarUrl: payload.avatarUrl || payload.avatar || null,
    addedAt: Date.now(),
  };
}

export const getHistory = async () => readObject(HISTORY_KEY);

export const addHistory = async (
  platform,
  gameid,
  nickname,
  avatar,
  rankIconUrl = null,
  rankLabel = null,
  rankPoints = null
) => {
  const platformSlug = normalizePlatform(platform);
  const id = String(gameid || "").trim();
  const entryId = getHistoryEntryId(platformSlug, id);
  if (!entryId) return null;

  const history = await getHistory();
  const next = { ...history };
  const existing = next[entryId] || {};

  delete next[entryId];
  next[entryId] = {
    ...existing,
    id: entryId,
    gameId: id,
    platform: platformSlug,
    nickname: String(nickname || id).trim() || id,
    avatar: avatar || existing.avatar || null,
    rankIconUrl: rankIconUrl || existing.rankIconUrl || null,
    rankLabel: rankLabel || existing.rankLabel || null,
    rating: rankPoints ?? existing.rating ?? null,
    searchedAt: Date.now(),
  };

  const ids = Object.keys(next);
  while (ids.length > MAX_HISTORY_ITEMS) {
    const oldestKey = ids.shift();
    delete next[oldestKey];
  }

  writeObject(HISTORY_KEY, next);
  emitHistoryUpdated(next);
  return next[entryId];
};

export const removeHistory = () => {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(HISTORY_KEY);
  emitHistoryUpdated({});
};

export const getFavorites = async () => readObject(FAVORITES_KEY);

export const getFavoritesCount = async () => {
  const favorites = await getFavorites();
  return Object.keys(favorites || {}).length;
};

export const isFavorite = async (id) => {
  const key = String(id || "").trim();
  if (!key) return false;
  const favorites = await getFavorites();
  return Boolean(favorites[key]);
};

export const addFavorite = async (payload) => {
  const item = normalizeFavorite(payload);
  if (!item) return null;

  const favorites = await getFavorites();
  const next = { ...favorites };
  const existing = next[item.id];

  if (existing && existing.addedAt) {
    item.addedAt = existing.addedAt;
  }

  delete next[item.id];
  next[item.id] = item;

  const ids = Object.keys(next);
  while (ids.length > MAX_FAVORITES_ITEMS) {
    const oldestKey = ids.shift();
    delete next[oldestKey];
  }

  writeObject(FAVORITES_KEY, next);
  emitFavoritesUpdated(next);

  return {
    added: !existing,
    item,
    favorites: next,
  };
};

export const removeFavorite = async (id) => {
  const key = String(id || "").trim();
  if (!key) return { removed: false, favorites: await getFavorites() };

  const favorites = await getFavorites();
  if (!favorites[key]) {
    return {
      removed: false,
      favorites,
    };
  }

  const next = { ...favorites };
  delete next[key];

  writeObject(FAVORITES_KEY, next);
  emitFavoritesUpdated(next);

  return {
    removed: true,
    favorites: next,
  };
};

export const toggleFavorite = async (payload) => {
  const item = normalizeFavorite(payload);
  if (!item) return null;

  const currentlyFavorite = await isFavorite(item.id);
  if (currentlyFavorite) {
    const result = await removeFavorite(item.id);
    return {
      favorited: false,
      favorites: result?.favorites || {},
      item,
    };
  }

  const result = await addFavorite(item);
  return {
    favorited: true,
    favorites: result?.favorites || {},
    item: result?.item || item,
  };
};

export const clearFavorites = async () => {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(FAVORITES_KEY);
  emitFavoritesUpdated({});
};
