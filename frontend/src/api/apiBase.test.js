import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./apiBase";

// The inline preload in index.html cannot read import.meta.env -- it is written
// into the HTML at build time -- so the rule that picks the API base has to be
// callable from vite.config.js as well as from the bundle. One rule, two callers.
describe("resolveApiUrl", () => {
  it("sends a development build through the dev-server proxy", () => {
    expect(resolveApiUrl({ mode: "development" })).toBe("/api");
  });

  it("sends a production build to our own API subdomain", () => {
    expect(resolveApiUrl({ mode: "production" })).toBe("https://api.pubgtracker.top/api");
  });

  it("treats an unknown mode as production rather than as a proxy path", () => {
    expect(resolveApiUrl({ mode: undefined })).toBe("https://api.pubgtracker.top/api");
  });

  it("lets an explicit override win over the mode", () => {
    expect(resolveApiUrl({ mode: "development", override: "https://staging.example/api" }))
      .toBe("https://staging.example/api");
  });

  it("ignores an empty override instead of pointing the app at nothing", () => {
    expect(resolveApiUrl({ mode: "production", override: "" }))
      .toBe("https://api.pubgtracker.top/api");
  });
});
