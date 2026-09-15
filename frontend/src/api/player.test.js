import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
const adoptResponse = vi.fn();

vi.mock("./fetch", () => ({
  get: (...args) => get(...args),
  post: (...args) => post(...args),
  adoptResponse: (...args) => adoptResponse(...args),
}));

import { getMatchReplay, getPlayerData, prefetchMatchReplay } from "./player";
import { RANK_PRELOAD_GLOBAL } from "./rankPreload";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  adoptResponse.mockReset();
});

describe("replay request cache", () => {
  it("reuses an intent-prefetch request when the replay page opens", async () => {
    const response = { data: { matchId: "cache-1", players: [] } };
    get.mockResolvedValue(response);

    const prefetched = prefetchMatchReplay("cache-1", "steam", "account.me", "Me");
    const opened = getMatchReplay("cache-1", "steam", "account.me", "Me");

    expect(opened).toBe(prefetched);
    await expect(opened).resolves.toBe(response);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      "/match/cache-1/replay?shard=steam&accountId=account.me&playerName=Me",
      false
    );
  });

  it("drops failed prefetches so opening the page can retry", async () => {
    get
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ data: { matchId: "retry-1", players: [] } });

    await expect(prefetchMatchReplay("retry-1", "steam", null, null)).rejects.toThrow("temporary");
    await expect(getMatchReplay("retry-1", "steam", null, null)).resolves.toMatchObject({
      data: { matchId: "retry-1" },
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1]).toBe(true);
  });
});

describe("adopting the inline rank preload", () => {
  afterEach(() => {
    delete globalThis[RANK_PRELOAD_GLOBAL];
  });

  const stash = (key, response) => {
    globalThis[RANK_PRELOAD_GLOBAL] = { key, response };
  };

  it("reads the response the inline script already has in flight instead of asking again", async () => {
    const wireResponse = { ok: true };
    const parsed = { data: { platformInfo: {} } };
    stash("steam|PlayerA", Promise.resolve(wireResponse));
    adoptResponse.mockResolvedValue(parsed);

    await expect(getPlayerData("steam", "PlayerA")).resolves.toBe(parsed);

    expect(post).not.toHaveBeenCalled();
    expect(adoptResponse).toHaveBeenCalledWith(wireResponse, true);
  });

  it("asks normally when the preload could not reach the network", async () => {
    // The inline script resolves to null rather than rejecting, so a dead
    // preload costs nothing and the real request reports the failure.
    stash("steam|PlayerA", Promise.resolve(null));
    post.mockResolvedValue({ data: {} });

    await getPlayerData("steam", "PlayerA");

    expect(adoptResponse).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith("/player/rank", { platform: "steam", gameId: "PlayerA", seasonId: null }, true);
  });

  it("asks normally for a player the preload was not started for", async () => {
    stash("steam|PlayerA", Promise.resolve({ ok: true }));
    post.mockResolvedValue({ data: {} });

    await getPlayerData("steam", "PlayerB");

    expect(adoptResponse).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith("/player/rank", { platform: "steam", gameId: "PlayerB", seasonId: null }, true);
  });

  it("asks normally when a past season is requested, which the preload never fetched", async () => {
    stash("steam|PlayerA", Promise.resolve({ ok: true }));
    post.mockResolvedValue({ data: {} });

    await getPlayerData("steam", "PlayerA", "division.bro.official.pc-2018-42");

    expect(adoptResponse).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(
      "/player/rank",
      { platform: "steam", gameId: "PlayerA", seasonId: "division.bro.official.pc-2018-42" },
      true
    );
  });

  it("refetches on the second lookup rather than replaying the page-load response", async () => {
    stash("steam|PlayerA", Promise.resolve({ ok: true }));
    adoptResponse.mockResolvedValue({ data: {} });
    post.mockResolvedValue({ data: {} });

    await getPlayerData("steam", "PlayerA");
    await getPlayerData("steam", "PlayerA");

    expect(adoptResponse).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("asks normally when nothing was preloaded at all", async () => {
    post.mockResolvedValue({ data: {} });

    await getPlayerData("steam", "PlayerA");

    expect(post).toHaveBeenCalledTimes(1);
  });
});
