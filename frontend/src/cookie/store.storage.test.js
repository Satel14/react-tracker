import { beforeEach, afterEach, expect, test, vi } from "vitest";

let store;
beforeEach(async () => {
  vi.resetModules();
  window.localStorage.clear();
  store = await import("./store");
});
afterEach(() => vi.restoreAllMocks());

test.each(["getter", "getItem"])("history, favorites and recent searches survive blocked storage %s", async (failure) => {
  const deny = () => { throw new DOMException("Storage disabled", "SecurityError"); };
  if (failure === "getter") vi.spyOn(window, "localStorage", "get").mockImplementation(deny);
  else vi.spyOn(Storage.prototype, "getItem").mockImplementation(deny);

  expect(store.readHistory()).toEqual({});
  expect(store.readCachedRecentSearches()).toEqual([]);
  await expect(store.getFavorites()).resolves.toEqual({});
  await store.addHistory("steam", "Alpha", "Alpha");
  expect(store.readHistory()["steam:Alpha"].nickname).toBe("Alpha");
  await store.cacheRecentSearches([{ nickname: "Alpha" }]);
  expect(store.readCachedRecentSearches()).toEqual([{ nickname: "Alpha" }]);
  await expect(store.toggleFavorite({ accountId: "account.alpha", nickname: "Alpha" })).resolves.toMatchObject({ favorited: true });
  expect(await store.isFavorite("account.alpha")).toBe(true);
  await expect(store.toggleFavorite({ accountId: "account.alpha", nickname: "Alpha" })).resolves.toMatchObject({ favorited: false });
  expect(await store.getFavorites()).toEqual({});
});

test("quota failure keeps updates readable instead of reviving stale persisted values", async () => {
  await store.addHistory("steam", "Alpha", "Alpha");
  await store.toggleFavorite({ accountId: "account.alpha", nickname: "Alpha" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  await store.addHistory("steam", "Bravo", "Bravo");
  expect(Object.keys(await store.getHistory())).toEqual(["steam:Alpha", "steam:Bravo"]);
  await store.toggleFavorite({ accountId: "account.bravo", nickname: "Bravo" });
  expect(Object.keys(await store.getFavorites())).toEqual(["account.alpha", "account.bravo"]);
  await store.removeFavorite("account.alpha");
  expect(Object.keys(await store.getFavorites())).toEqual(["account.bravo"]);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("Disabled", "SecurityError");
  });
  await store.clearFavorites();
  expect(await store.getFavorites()).toEqual({});
});
