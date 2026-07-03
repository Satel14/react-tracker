import { describe, it, expect } from "vitest";
import { getPlatformAvatar } from "./other";
import * as playerIdentity from "./playerIdentity";

describe("other.jsx platform helpers", () => {
  it("resolves avatars using the canonical platform normalization", () => {
    expect(getPlatformAvatar("STEAM")).toBe("/images/steam_avatar.jpg");
    expect(getPlatformAvatar("xbl")).toBe("/images/xbox_avatar.jpg"); // xbl -> xbox
    expect(getPlatformAvatar("psn")).toBe("/images/psn_avatar.jpg");
    expect(getPlatformAvatar(undefined)).toBe("/images/steam_avatar.jpg"); // default
    expect(getPlatformAvatar("nonsense")).toBe("/images/steam_avatar.jpg"); // fallback
  });

  it("does not ship its own platform normalizer (uses the shared one)", () => {
    // canonical exists and is the single source of truth
    expect(typeof playerIdentity.normalizePlatform).toBe("function");
    expect(playerIdentity.normalizePlatform("xbl")).toBe("xbox");
  });
});
