import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../component/Notification", () => ({ default: vi.fn() }));
import openNotification from "../component/Notification";
import { post, get } from "./fetch";

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; vi.clearAllMocks(); });

describe("fetch helpers", () => {
  it("post resolves the JSON body on ok", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: 1 }) }));
    await expect(post("/x", { a: 1 })).resolves.toEqual({ data: 1 });
  });

  it("get throws an Error carrying status and payload on non-ok", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ message: "down" }) }));
    await expect(get("/y")).rejects.toMatchObject({ message: "down", status: 503, payload: { message: "down" } });
    expect(openNotification).not.toHaveBeenCalled();
  });

  it("notifies on non-ok only when notificationErr is true", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ message: "boom" }) }));
    await expect(post("/z", {}, true)).rejects.toThrow("boom");
    expect(openNotification).toHaveBeenCalledWith("error", "Request error", "boom");
  });
});

// The wait used to be unbounded. A stalled connection that never answers and
// never fails left a skeleton on screen with no error and no retry -- the
// failure mode a visitor reads as "the site is broken".
describe("the request timeout", () => {
  it("passes an abort signal to fetch", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await get("/x");
    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(false);
  });

  it("gives up on a request that never answers, and says that is what happened", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn((_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")));
        })
      );
      const pending = get("/never");
      const assertion = expect(pending).rejects.toMatchObject({ timeout: true });
      await vi.advanceTimersByTimeAsync(45_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  // Well clear of the 22.9 s cold start this API has been measured at: a
  // tighter bound would turn a slow first load into an error on a request that
  // was going to succeed.
  it("waits longer than the API takes to wake up", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(
        (_url, { signal }) =>
          new Promise((resolve, reject) => {
            setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ woke: true }) }), 25_000);
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const pending = get("/slow");
      await vi.advanceTimersByTimeAsync(25_000);
      await expect(pending).resolves.toEqual({ woke: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer running behind a request that finished", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
      await post("/done", {});
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timer even when the request fails", async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn(async () => { throw new Error("network down"); });
      await expect(get("/broken")).rejects.toThrow("network down");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
