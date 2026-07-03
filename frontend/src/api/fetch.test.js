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
