import { beforeEach, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("./fetch", () => ({
  get: (...args) => get(...args),
  post: vi.fn(),
}));

import { getRankDistribution } from "./census";

beforeEach(() => {
  get.mockReset();
});

it("asks for the tier distribution over a window of days", async () => {
  get.mockResolvedValue({ data: {} });
  await getRankDistribution(14);
  expect(get).toHaveBeenCalledWith("/census/distribution?days=14", false);
});

it("defaults to the seven days the endpoint pools over", async () => {
  get.mockResolvedValue({ data: {} });
  await getRankDistribution();
  expect(get).toHaveBeenCalledWith("/census/distribution?days=7", false);
});

// The notification argument is deliberately false. A census that cannot be
// reached must not throw a toast over an article somebody came to read -- the
// section folds and the rest of the page carries on.
it("stays quiet when the census cannot be reached", async () => {
  get.mockRejectedValue(new Error("offline"));
  await expect(getRankDistribution()).rejects.toThrow("offline");
  expect(get).toHaveBeenCalledWith("/census/distribution?days=7", false);
});
