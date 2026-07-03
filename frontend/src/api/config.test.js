import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs?.();
  vi.unstubAllGlobals?.();
  vi.resetModules();
});

describe("resolveAbsoluteApiUrl", () => {
  it("prefixes API_URL with window.location.origin when API_URL is relative (dev mode)", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    const { API_URL, resolveAbsoluteApiUrl } = await import("./config");

    expect(API_URL).toBe("/api");
    expect(resolveAbsoluteApiUrl()).toBe(`http://localhost:3000${API_URL}`);
  });

  it("returns API_URL unchanged when it is already absolute (prod mode)", async () => {
    vi.stubEnv("MODE", "production");
    const { API_URL, resolveAbsoluteApiUrl } = await import("./config");

    expect(API_URL.startsWith("/")).toBe(false);
    expect(resolveAbsoluteApiUrl()).toBe(API_URL);
  });
});
