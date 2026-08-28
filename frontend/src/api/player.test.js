import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("./fetch", () => ({
  get: (...args) => get(...args),
  post: vi.fn(),
}));

import { getMatchReplay, prefetchMatchReplay } from "./player";

beforeEach(() => {
  get.mockReset();
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
