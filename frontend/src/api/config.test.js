import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveAbsoluteApiUrl } from "./config";

afterEach(() => { vi.unstubAllEnvs?.(); vi.unstubAllGlobals?.(); });

describe("resolveAbsoluteApiUrl", () => {
  it("prefers VITE_API_URL when set", () => {
    vi.stubEnv("VITE_API_URL", "https://custom.example/api");
    expect(resolveAbsoluteApiUrl()).toBe("https://custom.example/api");
  });

  it("uses window origin on localhost", () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubGlobal("window", { location: { hostname: "localhost", origin: "http://localhost:3000" } });
    expect(resolveAbsoluteApiUrl()).toBe("http://localhost:3000/api");
  });

  it("falls back to the production URL otherwise", () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubGlobal("window", { location: { hostname: "pubgtracker.example", origin: "https://pubgtracker.example" } });
    expect(resolveAbsoluteApiUrl()).toBe("https://pubgtracker-api.onrender.com/api");
  });
});
